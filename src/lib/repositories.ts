import type { Repository } from "@/types";
import {
  github,
  githubResponse,
  normalizeRepository,
  type GitHubRepository,
} from "./github";
import { AppError } from "./http";
import { observeOperation } from "./observability";
export async function cacheRepositories(
  db: D1Database,
  repos: Repository[],
  snapshot = false,
) {
  return observeOperation(
    "repository_cache",
    async () => {
      if (!repos.length) return;
      const now = Date.now();
      const statements = repos.map((repo) =>
        db
          .prepare(
            `INSERT INTO repositories(id,full_name,data,fetched_at) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,data=excluded.data,fetched_at=excluded.fetched_at`,
          )
          .bind(repo.id, repo.fullName, JSON.stringify(repo), now),
      );
      if (snapshot)
        statements.push(
          ...repos.map((repo) =>
            db
              .prepare(
                `INSERT INTO star_snapshots(repo_id,day,stars) VALUES(?,?,?)
    ON CONFLICT(repo_id,day) DO UPDATE SET stars=excluded.stars`,
              )
              .bind(
                repo.id,
                new Date(now).toISOString().slice(0, 10),
                repo.stars,
              ),
          ),
        );
      await db.batch(statements);
    },
    repos.length,
  );
}
export async function repository(
  env: CloudflareEnv,
  name: string,
  details = false,
): Promise<Repository> {
  const row = await env.DB.prepare(
    "SELECT data,fetched_at FROM repositories WHERE full_name=?",
  )
    .bind(name)
    .first<{ data: string; fetched_at: number }>();
  const cached: Repository | null = row ? JSON.parse(row.data) : null;
  if (
    cached &&
    Date.now() - row!.fetched_at < 3600000 &&
    (!details || cached.languages)
  )
    return cached;
  const raw = await github<GitHubRepository>(
    `/repos/${name}`,
    env.GITHUB_TOKEN,
  );
  if (raw.private) throw new AppError("notFound", 404);
  const repo = normalizeRepository(raw);
  if (details) {
    repo.languages = await github<Record<string, number>>(
      `/repos/${name}/languages`,
      env.GITHUB_TOKEN,
    );
    const response = await githubResponse(
      `/repos/${name}/contributors?per_page=1&anon=true`,
      env.GITHUB_TOKEN,
    );
    const last = response.headers
      .get("link")
      ?.match(/[?&]page=(\d+)>; rel="last"/);
    if (last) repo.contributors = Number(last[1]);
    else if (response.status !== 204)
      repo.contributors = ((await response.json()) as unknown[]).length;
  }
  await cacheRepositories(env.DB, [repo]);
  return repo;
}
