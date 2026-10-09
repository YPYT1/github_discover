import { getEnv } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import { parseFilters } from "@/lib/filters";
import { feed } from "@/lib/feed";
import { AppError, checkOrigin, errorResponse, readBody } from "@/lib/http";
import { isRecommendation } from "@/lib/recommendations";
import { observeOperation } from "@/lib/observability";
export async function GET(request: Request) {
  try {
    const env = await getEnv();
    const params = new URL(request.url).searchParams;
    return Response.json(
      await observeOperation("feed", async () =>
        feed(
          env,
          parseFilters(params),
          params.get("cursor"),
          await currentUser(env),
        ),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    checkOrigin(request, env.APP_URL);
    const body = await readBody(request, 150000);
    if (
      typeof body.query !== "string" ||
      body.query.length > 2048 ||
      !Array.isArray(body.seen) ||
      body.seen.length > 10000 ||
      !body.seen.every((id) => Number.isSafeInteger(id) && id > 0) ||
      (body.cursor !== null && typeof body.cursor !== "string")
    )
      throw new AppError("invalidRequest");
    const f = parseFilters(new URLSearchParams(body.query));
    const cursor = body.cursor;
    const seen = body.seen;
    if (!isRecommendation(f)) throw new AppError("invalidRequest");
    return Response.json(
      await observeOperation("feed", async () =>
        feed(env, f, cursor, await currentUser(env), {
          seen,
        }),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
