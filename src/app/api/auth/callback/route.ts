import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { cookieOptions } from "@/lib/auth";
import { encryptToken, randomToken, hashToken } from "@/lib/crypto";
import { github } from "@/lib/github";
import { AppError } from "@/lib/http";
export async function GET(request: Request) {
  const env = await getEnv();
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const expected = jar.get("discover_oauth")?.value;
  jar.delete("discover_oauth");
  try {
    if (params.get("error")) throw new AppError("authDenied");
    if (!expected || expected !== params.get("state") || !params.get("code"))
      throw new AppError("authFailed");
    if (
      !env.GITHUB_CLIENT_ID ||
      !env.GITHUB_CLIENT_SECRET ||
      !env.TOKEN_ENCRYPTION_KEY
    )
      throw new AppError("authUnavailable");
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: params.get("code"),
          redirect_uri: `${env.APP_URL}/api/auth/callback`,
        }),
      },
    );
    const grant = (await response.json()) as {
      access_token?: string;
      scope?: string;
    };
    if (!response.ok || !grant.access_token) throw new AppError("authFailed");
    const user = await github<{
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
    }>("/user", grant.access_token);
    const now = Date.now();
    const session = randomToken();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users(id,login,name,avatar,token_encrypted,scopes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name,avatar=excluded.avatar,token_encrypted=excluded.token_encrypted,scopes=excluded.scopes,updated_at=excluded.updated_at`,
      ).bind(
        user.id,
        user.login,
        user.name,
        user.avatar_url,
        await encryptToken(grant.access_token, env.TOKEN_ENCRYPTION_KEY),
        grant.scope ?? "",
        now,
        now,
      ),
      env.DB.prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      ).bind(await hashToken(session), user.id, now + 30 * 86400000),
    ]);
    jar.set("discover_session", session, {
      ...cookieOptions(env),
      maxAge: 30 * 86400,
    });
    return NextResponse.redirect(new URL("/", env.APP_URL));
  } catch (error) {
    const code = error instanceof AppError ? error.code : "authFailed";
    return NextResponse.redirect(new URL(`/?authError=${code}`, env.APP_URL));
  }
}
