import { github, normalizeRepository, type GitHubRepository } from "./github";
import { cacheRepositories } from "./repositories";
import { AppError } from "./http";
import {
  acquireLease,
  releaseLease,
  alert,
  resolveAlert,
  status,
} from "./operations";
import { errorCategory } from "./observability";

async function collect<T>(path: string, token?: string): Promise<T> {
  try {
    return await github<T>(path, token);
  } catch (error) {
    // At most one retry for network/5xx, never retry quota or auth rejection.
    if (!(
      error instanceof AppError &&
      ["networkError", "githubError"].includes(error.code)
    ))
      throw error;
    return github<T>(path, token);
  }
}
export async function syncRepositories(env: CloudflareEnv) {
  const owner = await acquireLease(env.DB, "sync", 600000);
  if (!owner) return { ok: true, skipped: true };
  const progress = {
    startedAt: Date.now(),
    finishedAt: 0,
    searches: 0,
    revisited: 0,
    snapshots: 0,
    missing: 0,
    outcome: "running",
    errorCode: "",
  };
  try {
    await status(env.DB, "sync", progress);
    if (!env.GITHUB_TOKEN) await alert(env.DB, "tokenMissing");
    else await resolveAlert(env.DB, "tokenMissing");
    for (const query of [
      "stars:>1000",
      "topic:machine-learning stars:>100",
      "topic:developer-tools stars:>100",
      `created:>=${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)} stars:>10`,
    ]) {
      const data = await collect<{ items: GitHubRepository[] }>(
        `/search/repositories?${new URLSearchParams({ q: `${query} is:public archived:false`, sort: "stars", per_page: "100" })}`,
        env.GITHUB_TOKEN,
      );
      const repos = data.items
        .filter((r) => !r.private)
        .map(normalizeRepository);
      await cacheRepositories(env.DB, repos, true);
      progress.searches++;
      progress.snapshots += repos.length;
      await status(env.DB, "sync", progress);
    }
    const tracked = await env.DB.prepare(
      "SELECT full_name FROM repositories ORDER BY fetched_at ASC,id ASC LIMIT 40",
    ).all<{ full_name: string }>();
    for (const row of tracked.results) {
      if (Date.now() - progress.startedAt > 240000)
        throw new AppError("syncIncomplete", 503);
      try {
        const raw = await collect<GitHubRepository>(
          `/repos/${row.full_name}`,
          env.GITHUB_TOKEN,
        );
        if (raw.private) {
          progress.missing++;
          continue;
        }
        await cacheRepositories(env.DB, [normalizeRepository(raw)], true);
        progress.revisited++;
        progress.snapshots++;
      } catch (error) {
        if (error instanceof AppError && error.code === "notFound")
          progress.missing++;
        else throw error;
      }
      if ((progress.revisited + progress.missing) % 10 === 0)
        await status(env.DB, "sync", progress);
    }
    // Public stale fallback has a 24h ceiling; retain its entries past fresh TTL.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(
        Date.now(),
      ),
      env.DB.prepare("DELETE FROM feed_cache WHERE expires_at<?").bind(
        Date.now() - 86400000,
      ),
      env.DB.prepare("DELETE FROM operation_leases WHERE expires_at<?").bind(
        Date.now(),
      ),
      env.DB.prepare(
        "DELETE FROM operation_status WHERE key LIKE 'quota:%' AND updated_at<?",
      ).bind(Date.now() - 86400000),
      env.DB.prepare("DELETE FROM star_snapshots WHERE day<?").bind(
        new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10),
      ),
    ]);
    progress.outcome = "ok";
    progress.finishedAt = Date.now();
    await status(env.DB, "sync", progress);
    await status(env.DB, "sync:last-success", {
      finishedAt: progress.finishedAt,
    });
    await resolveAlert(env.DB, "syncFailed");
    return { ok: true, ...progress };
  } catch (error) {
    progress.outcome = "failed";
    progress.finishedAt = Date.now();
    progress.errorCode = errorCategory(error);
    await status(env.DB, "sync", progress);
    await alert(env.DB, "syncFailed");
    if (progress.errorCode === "rateLimited") await alert(env.DB, "quotaLow");
    throw error;
  } finally {
    await releaseLease(env.DB, "sync", owner);
  }
}
export async function operationReport(env: CloudflareEnv) {
  const rows = await env.DB.prepare(
    "SELECT day,COUNT(*) AS count FROM star_snapshots GROUP BY day ORDER BY day DESC LIMIT 101",
  ).all<{ day: string; count: number }>();
  const days = rows.results;
  const sync = await env.DB.prepare(
    "SELECT data,updated_at FROM operation_status WHERE key='sync'",
  ).first<{ data: string; updated_at: number }>();
  const alerts = await env.DB.prepare(
    "SELECT code,first_at,last_at,count,resolved_at FROM operation_alerts ORDER BY last_at DESC",
  ).all();
  const lastSuccess = await env.DB.prepare(
    "SELECT updated_at FROM operation_status WHERE key='sync:last-success'",
  ).first<{ updated_at: number }>();
  const coverage: Record<string, number> = {};
  const today = new Date().toISOString().slice(0, 10);
  for (const period of [1, 7, 30]) {
    const target = new Date(Date.now() - period * 86400000)
      .toISOString()
      .slice(0, 10);
    const row = await env.DB.prepare(
      `SELECT COUNT(DISTINCT recent.repo_id) AS count FROM star_snapshots recent WHERE recent.day=? AND EXISTS(SELECT 1 FROM star_snapshots baseline WHERE baseline.repo_id=recent.repo_id AND baseline.day BETWEEN ? AND ?)`,
    )
      .bind(
        today,
        new Date(Date.now() - (period + 1) * 86400000)
          .toISOString()
          .slice(0, 10),
        target,
      )
      .first<{ count: number }>();
    coverage[String(period)] = row?.count ?? 0;
  }
  return {
    tokenConfigured: Boolean(env.GITHUB_TOKEN),
    externalAlertsEnabled: false,
    archive: "local-tool-only",
    sync: sync ? JSON.parse(sync.data) : null,
    lastSuccessAt: lastSuccess?.updated_at ?? null,
    collectionOverdue:
      !lastSuccess || Date.now() - lastSuccess.updated_at > 8 * 3600000,
    coverage,
    snapshotDays: days,
    alerts: alerts.results,
  };
}
