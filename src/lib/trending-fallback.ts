import type { Repository } from "@/types";
import { filterVariants, searchQuery, type Filters } from "./filters";
import { normalizeRepository, type GitHubRepository } from "./github";
import { publicGithub } from "./public-github";
import { cacheRepositories } from "./repositories";
import { hashToken } from "./crypto";
import { recordCache } from "./observability";

// A disclosed activity/popularity fallback, never a substitute Star delta.
export async function activePopular(env: CloudflareEnv, f: Filters) {
  const key = `active-popular:v1:${await hashToken(JSON.stringify(f))}`;
  const stored = await env.DB.prepare(
    "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
  )
    .bind(key, Date.now())
    .first<{ data: string }>();
  recordCache("trending", Boolean(stored));
  if (stored)
    return { repos: JSON.parse(stored.data) as Repository[], degraded: false };
  const days = f.period === "day" ? 1 : f.period === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const candidates: Repository[] = [];
  let degraded = false;
  for (const variant of filterVariants(f)) {
    const {
      data: batch,
      stale,
      fetchedAt,
    } = await publicGithub<{ items: GitHubRepository[] }>(
      env,
      `/search/repositories?${new URLSearchParams({ q: `${searchQuery({ ...variant, updated: "" })} pushed:>=${f.updated > since ? f.updated : since}`, sort: "stars", order: "desc", per_page: "100" })}`,
    );
    degraded ||= stale;
    // Cached old Star counts must never be treated as a fresh observation.
    if (!stale)
      await cacheRepositories(
        env.DB,
        batch.items.map(normalizeRepository),
        true,
        fetchedAt,
      );
    candidates.push(
      ...batch.items.filter((r) => !r.private).map(normalizeRepository),
    );
  }
  const repos = [...new Map(candidates.map((r) => [r.id, r])).values()].sort(
    (a, b) => b.stars - a.stars || a.id - b.id,
  );
  if (degraded) return { repos, degraded };
  await env.DB.prepare(
    "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
  )
    .bind(key, JSON.stringify(repos), Date.now() + 900000)
    .run();
  return { repos, degraded };
}
