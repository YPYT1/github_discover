import { githubResponse, type GitHubRepository } from "./github";
import { AppError } from "./http";
import { hashToken } from "./crypto";
import {
  acquireLease,
  releaseLease,
  collectorKey,
  alert,
  resolveAlert,
  status,
} from "./operations";
const pending = new WeakMap<
  D1Database,
  Map<string, Promise<PublicResult<unknown>>>
>();
export interface PublicResult<T> {
  data: T;
  stale: boolean;
  fetchedAt: number;
}
const MAX_STALE = 86400000;
export function retryable(error: unknown) {
  return (
    error instanceof AppError &&
    ["rateLimited", "networkError", "githubError"].includes(error.code)
  );
}
// Only service-token PUBLIC endpoints may enter this shared cache. Never /user.
export async function publicGithub<T>(
  env: CloudflareEnv,
  path: string,
): Promise<PublicResult<T>> {
  if (
    !path.startsWith("/search/repositories?") &&
    !/^\/repos\/[-\w]+\/[-\w.]+(?:\/languages)?$/.test(path)
  )
    throw new AppError("invalidRequest");
  const key = `public-github:v1:${await hashToken(path)}`;
  let map = pending.get(env.DB);
  if (!map) {
    map = new Map();
    pending.set(env.DB, map);
  }
  const existing = map.get(key);
  if (existing) return existing as Promise<PublicResult<T>>;
  if (map.size >= 64) throw new AppError("rateLimited", 429);
  const promise = load<T>(env, path, key);
  map.set(key, promise);
  try {
    return await promise;
  } finally {
    map.delete(key);
  }
}
async function load<T>(
  env: CloudflareEnv,
  path: string,
  key: string,
): Promise<PublicResult<T>> {
  const stored = await env.DB.prepare(
    "SELECT data,expires_at FROM feed_cache WHERE key=?",
  )
    .bind(key)
    .first<{ data: string; expires_at: number }>();
  const cached = stored
    ? (JSON.parse(stored.data) as { data: T; fetchedAt: number })
    : null;
  const available = () =>
    cached && Date.now() - cached.fetchedAt <= MAX_STALE
      ? { ...cached, stale: true }
      : null;
  if (cached && stored!.expires_at > Date.now())
    return { ...cached, stale: false };
  const quotaKey = await collectorKey(env.GITHUB_TOKEN);
  const quota = await env.DB.prepare(
    "SELECT data FROM operation_status WHERE key=?",
  )
    .bind(quotaKey)
    .first<{ data: string }>();
  const quotaData = quota ? JSON.parse(quota.data) : null;
  if (quotaData?.blockedUntil > Date.now()) {
    const stale = available();
    if (stale) return stale;
    throw new AppError("rateLimited", 429);
  }
  const owner = await acquireLease(env.DB, key);
  if (!owner) {
    const stale = available();
    if (stale) return stale;
    // Don't spin, sleep indefinitely or duplicate the owner's upstream call.
    throw new AppError("rateLimited", 429);
  }
  try {
    const response = await githubResponse(path, env.GITHUB_TOKEN);
    const remaining = Number(
      response.headers.get("x-ratelimit-remaining") ?? NaN,
    );
    if (Number.isFinite(remaining) && remaining <= 2) {
      await status(env.DB, quotaKey, {
        blockedUntil: remaining === 0 ? Date.now() + 60000 : 0,
        remaining,
        notifiedAt: quotaData?.notifiedAt ?? 0,
      });
      if (!quotaData || Date.now() - (quotaData.notifiedAt ?? 0) > 300000) {
        await alert(env.DB, "quotaLow");
        await status(env.DB, quotaKey, {
          blockedUntil: remaining === 0 ? Date.now() + 60000 : 0,
          remaining,
          notifiedAt: Date.now(),
        });
      }
    } else if (Number.isFinite(remaining) && remaining > 2 && quotaData) {
      await env.DB.prepare("DELETE FROM operation_status WHERE key=?")
        .bind(quotaKey)
        .run();
      await resolveAlert(env.DB, "quotaLow");
    }
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new AppError("networkError", 502);
    }
    // A mistakenly overprivileged service token must not publish private repos.
    const raw = data as GitHubRepository | { items?: GitHubRepository[] };
    if (!raw || typeof raw !== "object") throw new AppError("githubError", 502);
    if ("private" in (raw as object) && (raw as GitHubRepository).private)
      throw new AppError("notFound", 404);
    if (
      "items" in (raw as object) &&
      Array.isArray((raw as { items: unknown }).items)
    )
      (raw as { items: GitHubRepository[] }).items = (
        raw as { items: GitHubRepository[] }
      ).items.filter((r) => !r.private);
    const fetchedAt = Date.now();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
    )
      .bind(key, JSON.stringify({ data, fetchedAt }), fetchedAt + 900000)
      .run();
    return { data, stale: false, fetchedAt };
  } catch (error) {
    if (error instanceof AppError && error.code === "rateLimited") {
      await status(env.DB, quotaKey, {
        blockedUntil: Date.now() + (error.retryAfter ?? 60) * 1000,
      });
      await alert(env.DB, "quotaLow");
    }
    const stale = available();
    if (stale && retryable(error)) return stale;
    throw error;
  } finally {
    await releaseLease(env.DB, key, owner);
  }
}
