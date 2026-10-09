import { getEnv } from "@/lib/env";
import { requireUser, publicUser, userToken } from "@/lib/auth";
import { repository } from "@/lib/repositories";
import { githubResponse } from "@/lib/github";
import { AppError, checkOrigin, errorResponse, readBody } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const env = await getEnv();
    const user = await requireUser(env);
    const name = new URL(request.url).searchParams.get("name");
    if (!name || !/^[-\w]+\/[-\w.]+$/.test(name))
      throw new AppError("invalidRequest");
    const row = await env.DB.prepare(
      "SELECT 1 AS saved FROM saved_repositories s JOIN repositories r ON r.id=s.repo_id WHERE s.user_id=? AND r.full_name=?",
    )
      .bind(user.id, name)
      .first();
    let starred: boolean | null = false;
    let starError: string | undefined;
    try {
      await githubResponse(`/user/starred/${name}`, await userToken(user, env));
      starred = true;
    } catch (error) {
      if (!(error instanceof AppError && error.code === "notFound")) {
        starred = null;
        starError = error instanceof AppError ? error.code : "serverError";
      }
    }
    return Response.json({ saved: Boolean(row), starred, starError });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    checkOrigin(request, env.APP_URL);
    const user = await requireUser(env);
    const body = await readBody(request);
    if (typeof body.name !== "string" || !/^[-\w]+\/[-\w.]+$/.test(body.name))
      throw new AppError("invalidRequest");
    if (!["save", "history", "dismiss", "star"].includes(String(body.action)))
      throw new AppError("invalidRequest");
    if (
      (body.action === "save" || body.action === "star") &&
      typeof body.enabled !== "boolean"
    )
      throw new AppError("invalidRequest");
    const repo = await repository(env, body.name);
    if (body.action === "history")
      await env.DB.prepare(
        "INSERT INTO recommendation_seen(user_id,repo_id,seen_at) VALUES(?,?,?) ON CONFLICT(user_id,repo_id) DO NOTHING",
      )
        .bind(user.id, repo.id, Date.now())
        .run();
    if (body.action === "star") {
      if (!publicUser(user).canStar) throw new AppError("starPermission", 403);
      await githubResponse(
        `/user/starred/${repo.fullName}`,
        await userToken(user, env),
        { method: body.enabled ? "PUT" : "DELETE" },
      );
    } else {
      const table =
        body.action === "save"
          ? "saved_repositories"
          : body.action === "history"
            ? "browsing_history"
            : "dismissed_repositories";
      const timestamp =
        body.action === "save"
          ? "saved_at"
          : body.action === "history"
            ? "viewed_at"
            : "dismissed_at";
      if (body.action === "save" && !body.enabled)
        await env.DB.prepare(
          `DELETE FROM ${table} WHERE user_id=? AND repo_id=?`,
        )
          .bind(user.id, repo.id)
          .run();
      else
        await env.DB.prepare(
          `INSERT INTO ${table}(user_id,repo_id,${timestamp}) VALUES(?,?,?) ON CONFLICT(user_id,repo_id) DO UPDATE SET ${timestamp}=excluded.${timestamp}`,
        )
          .bind(user.id, repo.id, Date.now())
          .run();
    }
    // Changes affect personal feed ranking; invalidate only this user's cached feeds.
    if (body.action === "star")
      await env.DB.prepare("DELETE FROM feed_cache WHERE key=?")
        .bind(`taste:${user.id}`)
        .run();
    await env.DB.prepare(
      "DELETE FROM feed_cache WHERE key LIKE ? OR key LIKE ?",
    )
      .bind(`feed:v2:${user.id}:%`, `collection:${user.id}:%`)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
