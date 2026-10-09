import { getEnv } from "@/lib/env";
import { currentUser, publicUser, requireUser } from "@/lib/auth";
import { locales } from "@/types";
import { AppError, checkOrigin, errorResponse, readBody } from "@/lib/http";
export async function GET() {
  try {
    const env = await getEnv();
    const user = await currentUser(env);
    return Response.json(
      {
        user: user ? publicUser(user) : null,
        authConfigured: Boolean(
          env.GITHUB_CLIENT_ID &&
          env.GITHUB_CLIENT_SECRET &&
          env.TOKEN_ENCRYPTION_KEY,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const env = await getEnv();
    checkOrigin(request, env.APP_URL);
    const user = await requireUser(env);
    const body = await readBody(request);
    const locale = body.locale ?? user.locale;
    const theme = body.theme ?? user.theme;
    if (
      typeof locale !== "string" ||
      !locales.some((l) => l === locale) ||
      typeof theme !== "string" ||
      !["light", "dark", "system"].includes(theme)
    )
      throw new AppError("invalidRequest");
    await env.DB.prepare(
      "UPDATE users SET locale=?,theme=?,updated_at=? WHERE id=?",
    )
      .bind(locale, theme, Date.now(), user.id)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
