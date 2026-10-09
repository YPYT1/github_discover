import { getEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { AppError, checkOrigin, errorResponse, readBody } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    checkOrigin(request, env.APP_URL);
    const user = await requireUser(env);
    const body = await readBody(request);
    if (body.userId !== undefined && body.userId !== user.id)
      throw new AppError("forbidden", 403);
    if (
      !Array.isArray(body.ids) ||
      body.ids.length > 100 ||
      !body.ids.every((id) => Number.isSafeInteger(id) && id > 0)
    )
      throw new AppError("invalidRequest");
    if (body.ids.length)
      await env.DB.batch(
        [...new Set<number>(body.ids)].map((id) =>
          env.DB.prepare(
            "INSERT INTO recommendation_seen(user_id,repo_id,seen_at) VALUES(?,?,?) ON CONFLICT(user_id,repo_id) DO NOTHING",
          ).bind(user.id, id, Date.now()),
        ),
      );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
