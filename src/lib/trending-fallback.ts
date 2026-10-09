import type { Repository } from "@/types";
import { filterVariants, searchQuery, type Filters } from "./filters";
import { github, normalizeRepository, type GitHubRepository } from "./github";
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
  if (stored) return JSON.parse(stored.data) as Repository[];
  const days = f.period === "day" ? 1 : f.period === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const candidates: Repository[] = [];
  for (const variant of filterVariants(f)) {
    const batch = await github<{ items: GitHubRepository[] }>(
      `/search/repositories?${new URLSearchParams({ q: `${searchQuery({ ...variant, updated: "" })} pushed:>=${f.updated > since ? f.updated : since}`, sort: "stars", order: "desc", per_page: "100" })}`,
      env.GITHUB_TOKEN,
    );
    candidates.push(
      ...batch.items.filter((r) => !r.private).map(normalizeRepository),
    );
  }
  const repos = [...new Map(candidates.map((r) => [r.id, r])).values()].sort(
    (a, b) => b.stars - a.stars || a.id - b.id,
  );
  await cacheRepositories(env.DB, repos, true);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
  )
    .bind(key, JSON.stringify(repos), Date.now() + 900000)
    .run();
  return repos;
}
