import { getEnv } from "@/lib/env";
import {
  github,
  normalizeRepository,
  type GitHubRepository,
} from "@/lib/github";
import { cacheRepositories } from "@/lib/repositories";
import { errorResponse, AppError } from "@/lib/http";
import { hashToken } from "@/lib/crypto";
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    if (
      !env.CRON_SECRET ||
      (await hashToken(request.headers.get("authorization") ?? "")) !==
        (await hashToken(`Bearer ${env.CRON_SECRET}`))
    )
      throw new AppError("forbidden", 403);
    for (const query of [
      "stars:>1000",
      "topic:machine-learning stars:>100",
      "topic:developer-tools stars:>100",
      "created:>=" +
        new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) +
        " stars:>10",
    ]) {
      const batch = await github<{ items: GitHubRepository[] }>(
        `/search/repositories?${new URLSearchParams({ q: `${query} is:public archived:false`, sort: "stars", per_page: "100" })}`,
        env.GITHUB_TOKEN,
      );
      await cacheRepositories(
        env.DB,
        batch.items.map(normalizeRepository),
        true,
      );
    }
    // Revisit previously discovered projects so growth baselines remain comparable.
    const tracked = await env.DB.prepare(
      "SELECT full_name FROM repositories ORDER BY fetched_at ASC LIMIT 40",
    ).all<{ full_name: string }>();
    for (const row of tracked.results) {
      try {
        await cacheRepositories(
          env.DB,
          [
            normalizeRepository(
              await github<GitHubRepository>(
                `/repos/${row.full_name}`,
                env.GITHUB_TOKEN,
              ),
            ),
          ],
          true,
        );
      } catch (error) {
        if (!(error instanceof AppError && error.code === "notFound"))
          throw error;
      }
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(
        Date.now(),
      ),
      env.DB.prepare("DELETE FROM feed_cache WHERE expires_at<?").bind(
        Date.now(),
      ),
      env.DB.prepare("DELETE FROM star_snapshots WHERE day<?").bind(
        new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10),
      ),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
