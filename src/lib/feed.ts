import type { FeedResponse, Repository } from "@/types";
import type { Filters } from "./filters";
import { categoryTopics, searchQuery, filterVariants } from "./filters";
import { AppError } from "./http";
import { github, normalizeRepository, type GitHubRepository } from "./github";
import { cacheRepositories } from "./repositories";
import { userToken, type UserRow } from "./auth";
import { hashToken } from "./crypto";
import { activePopular } from "./trending-fallback";
import {
  isRecommendation,
  recommendationFeed,
  type RecommendationOptions,
} from "./recommendations";

const PAGE_SIZE = 25;
export function matches(repo: Repository, f: Filters): boolean {
  if (f.language.includes(",") || f.category.includes(","))
    return filterVariants(f).some((v) => matches(repo, v));
  const text =
    `${repo.fullName} ${repo.description ?? ""} ${repo.topics.join(" ")}`.toLowerCase();
  return (
    (!f.q || text.includes(f.q.toLowerCase())) &&
    repo.stars >= f.minStars &&
    (!f.language ||
      (f.language === "Other"
        ? ![
            "TypeScript",
            "JavaScript",
            "Python",
            "Rust",
            "Go",
            "Java",
            "C++",
            "C#",
            "Swift",
            "Kotlin",
          ].includes(repo.language ?? "")
        : repo.language === f.language)) &&
    (f.category === "all" ||
      repo.topics.includes(categoryTopics[f.category])) &&
    (!f.license || repo.license?.toLowerCase() === f.license) &&
    (!f.created || repo.createdAt >= f.created) &&
    (!f.updated || repo.updatedAt >= f.updated)
  );
}
function sortRepos(repos: Repository[], f: Filters) {
  return repos.sort((a, b) =>
    f.sort === "created" || (f.tab === "latest" && f.sort === "recommended")
      ? b.createdAt.localeCompare(a.createdAt)
      : f.sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : f.sort === "growth" || f.tab === "trending"
          ? (b.growth ?? 0) - (a.growth ?? 0) || b.stars - a.stars
          : b.stars - a.stars,
  );
}
export async function feed(
  env: CloudflareEnv,
  f: Filters,
  cursor: string | null,
  user: UserRow | null,
  options: RecommendationOptions = {},
): Promise<FeedResponse> {
  if (isRecommendation(f))
    return recommendationFeed(env, f, cursor, user, options, matches);
  if (
    (f.language.includes(",") || f.category.includes(",")) &&
    !["saved", "history", "following", "stars", "trending"].includes(f.tab) &&
    f.sort !== "growth"
  ) {
    const key = `multi:${await hashToken(JSON.stringify(f) + (user?.id ?? "public"))}`;
    let offset = 0;
    if (cursor) {
      try {
        const c = JSON.parse(atob(cursor));
        if (c.key !== key || !Number.isInteger(c.offset) || c.offset < 0)
          throw new Error();
        offset = c.offset;
      } catch {
        throw new AppError("invalidCursor");
      }
    }
    const stored = await env.DB.prepare(
      "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
    )
      .bind(key, Date.now())
      .first<{ data: string }>();
    if (cursor && !stored) throw new AppError("invalidCursor");
    let repos: Repository[];
    if (stored) repos = JSON.parse(stored.data);
    else {
      const all: Repository[] = [];
      for (const variant of filterVariants(f)) {
        const data = await feed(env, variant, null, user);
        all.push(...data.repositories);
      }
      repos = sortRepos([...new Map(all.map((r) => [r.id, r])).values()], f);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
      )
        .bind(key, JSON.stringify(repos), Date.now() + 300000)
        .run();
    }
    return {
      repositories: repos.slice(offset, offset + 25),
      total: repos.length,
      nextCursor:
        offset + 25 < repos.length
          ? btoa(JSON.stringify({ key, offset: offset + 25 }))
          : null,
      notice: "multiScope",
    };
  }
  if (["following", "saved", "history", "stars"].includes(f.tab) && !user)
    throw new AppError("loginRequired", 401);
  const key = await hashToken(JSON.stringify(f) + (user?.id ?? "public"));
  let page = 1;
  if (cursor) {
    try {
      const decoded: { key: string; page: number } = JSON.parse(atob(cursor));
      if (
        decoded.key !== key ||
        !Number.isInteger(decoded.page) ||
        decoded.page < 1 ||
        decoded.page > 1000
      )
        throw new Error();
      page = decoded.page;
    } catch {
      throw new AppError("invalidCursor");
    }
  }
  const next = (more: boolean) =>
    more ? btoa(JSON.stringify({ key, page: page + 1 })) : null;
  const cacheKey = `feed:v2:${user?.id ?? "public"}:${key}:${page}`;
  const cached = await env.DB.prepare(
    "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
  )
    .bind(cacheKey, Date.now())
    .first<{ data: string }>();
  if (cached && !["saved", "history"].includes(f.tab))
    return JSON.parse(cached.data);
  let result: FeedResponse;
  if (["saved", "history"].includes(f.tab)) {
    const table = f.tab === "saved" ? "saved_repositories" : "browsing_history";
    const order = f.tab === "saved" ? "saved_at" : "viewed_at";
    const rows = await env.DB.prepare(
      `SELECT r.data FROM ${table} u JOIN repositories r ON r.id=u.repo_id WHERE u.user_id=? ORDER BY u.${order} DESC,u.repo_id DESC LIMIT 1000`,
    )
      .bind(user!.id)
      .all<{ data: string }>();
    let repos = rows.results
      .map((row) => JSON.parse(row.data) as Repository)
      .filter((repo) => matches(repo, f));
    if (f.sort !== "recommended") repos = sortRepos(repos, f);
    const start = (page - 1) * PAGE_SIZE;
    result = {
      repositories: repos.slice(start, start + PAGE_SIZE),
      total: repos.length,
      nextCursor: next(start + PAGE_SIZE < repos.length),
    };
  } else if (f.tab === "following" || f.tab === "stars") {
    const collectionKey = `collection:${user?.id ?? "public"}:${key}`;
    const stored = await env.DB.prepare(
      "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
    )
      .bind(collectionKey, Date.now())
      .first<{ data: string }>();
    let repos: Repository[];
    let limited = false;
    if (stored) {
      const data: { repos: Repository[]; limited: boolean } = JSON.parse(
        stored.data,
      );
      repos = data.repos;
      limited = data.limited;
    } else {
      const token = await userToken(user!, env);
      const raw: GitHubRepository[] = [];
      if (f.tab === "stars") {
        for (let i = 1; i <= 5; i++) {
          const batch = await github<GitHubRepository[]>(
            `/user/starred?per_page=100&page=${i}`,
            token,
          );
          raw.push(...batch);
          if (batch.length < 100) break;
          if (i === 5) limited = true;
        }
      } else {
        // Bound fan-out to protect GitHub rate limits; the UI discloses this scope.
        const people = await github<{ login: string }[]>(
          "/user/following?per_page=20",
          token,
        );
        limited = people.length === 20;
        for (let i = 0; i < people.length; i += 4) {
          const batches = await Promise.all(
            people
              .slice(i, i + 4)
              .map((person) =>
                github<GitHubRepository[]>(
                  `/users/${encodeURIComponent(person.login)}/repos?type=owner&sort=updated&per_page=10`,
                  token,
                ),
              ),
          );
          raw.push(...batches.flat());
        }
      }
      repos = Array.from(
        new Map(
          raw
            .filter((repo) => !repo.private)
            .map((repo) => [repo.id, normalizeRepository(repo)]),
        ).values(),
      );
      await cacheRepositories(env.DB, repos);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
      )
        .bind(
          collectionKey,
          JSON.stringify({ repos, limited }),
          Date.now() + 300000,
        )
        .run();
    }
    repos = sortRepos(
      repos.filter((repo) => matches(repo, f)),
      f,
    );
    const start = (page - 1) * PAGE_SIZE;
    result = {
      repositories: repos.slice(start, start + PAGE_SIZE),
      total: repos.length,
      nextCursor: next(start + PAGE_SIZE < repos.length),
      ...(limited ? { notice: "followingLimit" as const } : {}),
    };
  } else if (f.tab === "trending" || f.sort === "growth") {
    const days = f.period === "day" ? 1 : f.period === "month" ? 30 : 7;
    const baseline = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);
    const rows = await env.DB.prepare(
      `SELECT r.data,
      (SELECT stars FROM star_snapshots WHERE repo_id=r.id ORDER BY day DESC LIMIT 1) -
      (SELECT stars FROM star_snapshots WHERE repo_id=r.id AND day<=? ORDER BY day DESC LIMIT 1) AS growth
      FROM repositories r WHERE EXISTS(SELECT 1 FROM star_snapshots WHERE repo_id=r.id AND day<=?)
      AND EXISTS(SELECT 1 FROM star_snapshots WHERE repo_id=r.id AND day>?)`,
    )
      .bind(baseline, baseline, baseline)
      .all<{ data: string; growth: number }>();
    let repos = sortRepos(
      rows.results
        .map((row) => ({
          ...(JSON.parse(row.data) as Repository),
          growth: row.growth,
        }))
        .filter((repo) => matches(repo, f)),
      { ...f, sort: "growth" },
    );
    const fallback = repos.length === 0 && f.tab === "trending";
    if (fallback)
      repos = sortRepos(
        (await activePopular(env, f)).filter((repo) => matches(repo, f)),
        {
          ...f,
          tab: "for-you",
          sort:
            f.sort === "recommended" || f.sort === "growth" ? "stars" : f.sort,
        },
      );
    const start = (page - 1) * PAGE_SIZE;
    result = {
      repositories: repos.slice(start, start + PAGE_SIZE),
      total: repos.length,
      nextCursor: next(start + PAGE_SIZE < repos.length),
      ...(fallback
        ? { notice: "trendFallback" as const }
        : rows.results.length === 0
          ? { notice: "trendPending" as const }
          : {}),
    };
  } else if (f.tab === "latest" || f.sort === "created") {
    // GitHub repository search has no created-at sort. Build a bounded candidate
    // collection, then sort actual creation dates instead of pretending it does.
    const collectionKey = `collection:${user?.id ?? "public"}:${key}`;
    const stored = await env.DB.prepare(
      "SELECT data FROM feed_cache WHERE key=? AND expires_at>?",
    )
      .bind(collectionKey, Date.now())
      .first<{ data: string }>();
    let repos: Repository[];
    if (stored) repos = JSON.parse(stored.data);
    else {
      const candidates: Repository[] = [];
      for (let i = 1; i <= 3; i++) {
        const batch = await github<{ items: GitHubRepository[] }>(
          `/search/repositories?${new URLSearchParams({ q: searchQuery(f), sort: "updated", order: "desc", per_page: "100", page: String(i) })}`,
          env.GITHUB_TOKEN,
        );
        candidates.push(
          ...batch.items
            .filter((repo) => !repo.private)
            .map(normalizeRepository),
        );
        if (batch.items.length < 100) break;
      }
      repos = sortRepos(
        [...new Map(candidates.map((repo) => [repo.id, repo])).values()],
        { ...f, sort: "created" },
      );
      await cacheRepositories(env.DB, repos, true);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
      )
        .bind(collectionKey, JSON.stringify(repos), Date.now() + 300000)
        .run();
    }
    const start = (page - 1) * PAGE_SIZE;
    result = {
      repositories: repos.slice(start, start + PAGE_SIZE),
      total: repos.length,
      nextCursor: next(start + PAGE_SIZE < repos.length),
      notice: "latestScope",
    };
  } else {
    const query = searchQuery(f);
    const sort = f.sort === "updated" ? "updated" : "stars";
    const data = await github<{
      items: GitHubRepository[];
      total_count: number;
      incomplete_results: boolean;
    }>(
      `/search/repositories?${new URLSearchParams({ q: query, sort, order: "desc", per_page: String(PAGE_SIZE), page: String(page) })}`,
      env.GITHUB_TOKEN,
    );
    let repos = data.items.map(normalizeRepository);
    await cacheRepositories(env.DB, repos, true);
    if (user) {
      const dismissed = await env.DB.prepare(
        "SELECT repo_id FROM dismissed_repositories WHERE user_id=?",
      )
        .bind(user.id)
        .all<{ repo_id: number }>();
      const excluded = new Set(dismissed.results.map((row) => row.repo_id));
      repos = repos.filter((repo) => !excluded.has(repo.id));
    }
    const maximum = Math.min(data.total_count, 1000);
    result = {
      repositories: repos,
      total: data.total_count,
      nextCursor: next(
        page * PAGE_SIZE < maximum && data.items.length === PAGE_SIZE,
      ),
      ...(data.total_count > 1000 || data.incomplete_results
        ? { notice: "searchLimit" as const }
        : {}),
    };
  }
  if (!["saved", "history"].includes(f.tab))
    await env.DB.prepare(
      "INSERT OR REPLACE INTO feed_cache(key,data,expires_at) VALUES(?,?,?)",
    )
      .bind(cacheKey, JSON.stringify(result), Date.now() + 300000)
      .run();
  return result;
}
