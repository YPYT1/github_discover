import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { cookieOptions, currentUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
export async function GET(request: Request) {
  const env = await getEnv();
  if (
    !env.GITHUB_CLIENT_ID ||
    !env.GITHUB_CLIENT_SECRET ||
    !env.TOKEN_ENCRYPTION_KEY
  )
    return NextResponse.redirect(
      new URL("/?authError=authUnavailable", env.APP_URL),
    );
  const writing = new URL(request.url).searchParams.get("write") === "1";
  if (writing && !(await currentUser(env)))
    return NextResponse.redirect(
      new URL("/?authError=loginRequired", env.APP_URL),
    );
  const state = randomToken();
  (await cookies()).set("discover_oauth", state, {
    ...cookieOptions(env),
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/auth/callback`,
    state,
    scope: writing ? "public_repo" : "",
    allow_signup: "true",
  });
  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
  );
}
