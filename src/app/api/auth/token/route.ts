import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { cookieOptions } from "@/lib/auth";
import { randomToken, hashToken } from "@/lib/crypto";
import { github } from "@/lib/github";
import { AppError, checkOrigin, errorResponse, readBody } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    checkOrigin(request, env.APP_URL);
    const body = await readBody(request);
    if (
      typeof body.token !== "string" ||
      body.token.length < 20 ||
      body.token.length > 256
    )
      throw new AppError("invalidToken");
    const user = await github<{
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
    }>("/user", body.token);
    const session = randomToken();
    const now = Date.now();
    // Deliberately never bind the PAT into SQL, logs or a persisted server session.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users(id,login,name,avatar,created_at,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name,avatar=excluded.avatar,updated_at=excluded.updated_at`,
      ).bind(user.id, user.login, user.name, user.avatar_url, now, now),
      env.DB.prepare(
        "INSERT INTO sessions(token_hash,user_id,auth_method,expires_at) VALUES(?,?,'pat',?)",
      ).bind(await hashToken(session), user.id, now + 30 * 86400000),
    ]);
    (await cookies()).set("discover_session", session, {
      ...cookieOptions(env),
      maxAge: 30 * 86400,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
