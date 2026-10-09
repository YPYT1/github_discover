import type { FeedResponse, Repository } from "@/types";
import { type Filters, searchQuery, filterVariants } from "./filters";
import { type UserRow, userToken } from "./auth";
import { github, normalizeRepository, type GitHubRepository } from "./github";
import { cacheRepositories } from "./repositories";
import { hashToken } from "./crypto";
import { AppError } from "./http";
import {
  addTaste,
  emptyTaste,
  rankRecommendations,
  topSignals,
  type Taste,
} from "./recommendation-ranking";

export const isRecommendation = (f: Filters) =>
  f.tab === "for-you" && !f.q && f.sort === "recommended";
export interface RecommendationOptions {
  seen?: number[];
}
async function exclusions(
  db: D1Database,
  user: UserRow | null,
  seen: number[],
) {
  const ids = new Set(seen);
  if (user) {
    const rows = await db
      .prepare(
        `SELECT repo_id FROM recommendation_seen WHERE user_id=?
      UNION SELECT repo_id FROM browsing_history WHERE user_id=?
      UNION SELECT repo_id FROM dismissed_repositories WHERE user_id=?
      UNION SELECT repo_id FROM saved_repositories WHERE user_id=?`,
      )
      .bind(user.id, user.id, user.id, user.id)
      .all<{ repo_id: number }>();
    for (const row of rows.results) ids.add(row.repo_id);
  }
  return ids;
}
async function tasteFor(
  env: CloudflareEnv,
  user: UserRow | null,
  excluded: Set<number>,
): Promise<Taste> {
  const taste = emptyTaste();
  if (!user) return taste;
  const signals = await env.DB.prepare(
    `SELECT r.data,s.weight,s.time,s.negative FROM repositories r JOIN (
    SELECT repo_id,5 AS weight,saved_at AS time,0 AS negative FROM saved_repositories WHERE user_id=?
    UNION ALL SELECT repo_id,2 AS weight,viewed_at AS time,0 AS negative FROM browsing_history WHERE user_id=?
    UNION ALL SELECT repo_id,4 AS weight,dismissed_at AS time,1 AS negative FROM dismissed_repositories WHERE user_id=?
    ) s ON s.repo_id=r.id ORDER BY s.time DESC LIMIT 300`,
  )
    .bind(user.id, user.id, user.id)
    .all<{ data: string; weight: number; time: number; negative: number }>();
  for (const row of signals.results)
    addTaste(
      taste,
      JSON.parse(row.data),
      row.weight *
        Math.exp(-Math.max(0, Date.now() - row.time) / (180 * 86400000)),
      Boolean(row.negative),
    );
  const key = `taste:${user.id}`;
  const stored = await env.DB.prepare(
    "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
  )
    .bind(key, Date.now())
    .first<{ data: string }>();
  let sources: { stars: Repository[]; owned: Repository[] };
  if (stored) sources = JSON.parse(stored.data);
  else {
    // PAT stays request-local. Missing/revoked authorization does not block public discovery.
    let stars: Repository[] = [],
      owned: Repository[] = [];
    try {
      const token = await userToken(user, env);
      const results = await Promise.allSettled([
        github<GitHubRepository[]>(
          "/user/starred?per_page=100&sort=created&direction=desc",
          token,
        ),
        github<GitHubRepository[]>(
          `/users/${encodeURIComponent(user.login)}/repos?type=owner&sort=updated&per_page=100`,
          token,
        ),
      ]);
      const publicRepos = (raw: GitHubRepository[]) =>
        raw.filter((r) => !r.private).map(normalizeRepository);
      if (results[0].status === "fulfilled")
        stars = publicRepos(results[0].value);
      if (results[1].status === "fulfilled")
        owned = publicRepos(results[1].value);
      // Don't cache authorization failures as a successful empty profile.
      if (results.every((r) => r.status === "fulfilled"))
        await env.DB.prepare(
          "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
        )
          .bind(key, JSON.stringify({ stars, owned }), Date.now() + 1800000)
          .run();
    } catch {
      /* Continue with database signals; never log a token. */
    }
    sources = { stars, owned };
  }
  sources.stars.forEach((r) => {
    addTaste(taste, r, 4);
    excluded.add(r.id);
  });
  sources.owned.forEach((r) => {
    addTaste(taste, r, 6);
    excluded.add(r.id);
  });
  return taste;
}
async function candidates(
  env: CloudflareEnv,
  f: Filters,
  taste: Taste,
  seed: string,
) {
  const base = searchQuery(filterVariants(f)[0]);
  const languages = f.language ? [] : topSignals(taste.languages, 2);
  const topics =
    f.category !== "all"
      ? []
      : topSignals(taste.topics, 2).filter((t) => /^[a-z0-9-]+$/.test(t));
  const lanes = [
    ...filterVariants(f)
      .slice(1)
      .map((v) => `${searchQuery(v)} stars:10..9999`),
    `${base} stars:10..999 pushed:>=${new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)}`,
    `${base} stars:1000..9999`,
    `${base} stars:10..9999 created:>=${new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}`,
    ...languages.map(
      (l) => `${base} stars:10..9999 language:"${l.replaceAll('"', "")}"`,
    ),
    ...topics.map((t) => `${base} stars:10..9999 topic:${t}`),
  ];
  const rows = await env.DB.prepare(
    "SELECT data FROM repositories ORDER BY fetched_at DESC LIMIT 1500",
  ).all<{ data: string }>();
  const repos = rows.results.map((r) => JSON.parse(r.data) as Repository);
  let successful = false;
  let failure: unknown;
  // Sequential calls bound GitHub search pressure; each lane's cache is shared, not per user.
  for (let i = 0; i < lanes.length; i++) {
    const page = 1 + ((parseInt(seed.slice(0, 4), 16) + i) % 3);
    const query = lanes[i];
    const key = `candidates:${await hashToken(query + page)}`;
    const stored = await env.DB.prepare(
      "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
    )
      .bind(key, Date.now())
      .first<{ data: string }>();
    if (stored) {
      repos.push(...JSON.parse(stored.data));
      successful = true;
      continue;
    }
    try {
      let data = await github<{ items: GitHubRepository[] }>(
        `/search/repositories?${new URLSearchParams({ q: query, sort: i === 1 ? "stars" : "updated", order: "desc", per_page: "100", page: String(page) })}`,
        env.GITHUB_TOKEN,
      );
      if (!data.items.length && page > 1)
        data = await github<{ items: GitHubRepository[] }>(
          `/search/repositories?${new URLSearchParams({ q: query, sort: i === 1 ? "stars" : "updated", order: "desc", per_page: "100", page: "1" })}`,
          env.GITHUB_TOKEN,
        );
      const batch = data.items
        .filter((r) => !r.private)
        .map(normalizeRepository);
      repos.push(...batch);
      successful = true;
      await cacheRepositories(env.DB, batch, true);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
      )
        .bind(key, JSON.stringify(batch), Date.now() + 900000)
        .run();
    } catch (error) {
      failure = error;
      if (error instanceof AppError && error.code === "rateLimited") break;
    }
  }
  if (!successful && !repos.length)
    throw failure ?? new AppError("networkError", 503);
  return repos;
}
export async function recommendationFeed(
  env: CloudflareEnv,
  f: Filters,
  cursor: string | null,
  user: UserRow | null,
  options: RecommendationOptions,
  matches: (r: Repository, f: Filters) => boolean,
): Promise<FeedResponse> {
  const fingerprint = await hashToken(
    JSON.stringify(f) + (user?.id ?? "public"),
  );
  const excluded = await exclusions(env.DB, user, options.seen ?? []);
  let id: string,
    offset = 0,
    ordered: Repository[];
  if (cursor) {
    try {
      const value = JSON.parse(atob(cursor));
      if (
        !/^[a-f0-9-]{36}$/.test(value.id) ||
        value.key !== fingerprint ||
        !Number.isInteger(value.offset) ||
        value.offset < 0
      )
        throw new Error();
      id = value.id;
      offset = value.offset;
      const stored = await env.DB.prepare(
        "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
      )
        .bind(
          `recommendation:${user?.id ?? "public"}:${id}:${fingerprint}`,
          Date.now(),
        )
        .first<{ data: string }>();
      if (!stored) throw new Error();
      ordered = JSON.parse(stored.data);
      if (offset > ordered.length) throw new Error();
    } catch {
      throw new AppError("invalidCursor");
    }
  } else {
    id = crypto.randomUUID();
    const taste = await tasteFor(env, user, excluded);
    ordered = rankRecommendations(
      (await candidates(env, f, taste, id.replaceAll("-", ""))).filter((r) =>
        matches(r, f),
      ),
      taste,
      excluded,
      id,
    ).slice(0, 600);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
    )
      .bind(
        `recommendation:${user?.id ?? "public"}:${id}:${fingerprint}`,
        JSON.stringify(ordered),
        Date.now() + 3600000,
      )
      .run();
  }
  const repositories: Repository[] = [];
  while (offset < ordered.length && repositories.length < 25) {
    const repo = ordered[offset++];
    if (!excluded.has(repo.id)) repositories.push(repo);
  }
  const more = ordered.slice(offset).some((r) => !excluded.has(r.id));
  return {
    repositories,
    total: ordered.filter((r) => !excluded.has(r.id)).length,
    nextCursor: more
      ? btoa(JSON.stringify({ id, key: fingerprint, offset }))
      : null,
  };
}
