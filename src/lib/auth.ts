import { cookies, headers } from "next/headers";
import { github } from "./github";
import { decryptToken, hashToken } from "./crypto";
import { AppError } from "./http";
import type { User } from "@/types";
export interface UserRow extends User {
  token_encrypted: string | null;
  scopes: string;
  auth_method: "oauth" | "pat";
}
export async function currentUser(env: CloudflareEnv): Promise<UserRow | null> {
  const token = (await cookies()).get("discover_session")?.value;
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id,u.login,u.name,u.avatar,u.locale,u.theme,u.token_encrypted,u.scopes,s.auth_method
    FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`,
  )
    .bind(await hashToken(token), Date.now())
    .first<UserRow>();
}
export async function requireUser(env: CloudflareEnv) {
  const user = await currentUser(env);
  if (!user) throw new AppError("loginRequired", 401);
  return user;
}
export function publicUser(user: UserRow): User {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatar: user.avatar,
    locale: user.locale,
    theme: user.theme,
    canStar:
      user.auth_method === "pat" ||
      user.scopes.split(/[ ,]+/).includes("public_repo"),
    authMethod: user.auth_method,
  };
}
export async function userToken(user: UserRow, env: CloudflareEnv) {
  if (user.auth_method === "pat") {
    const token = (await headers()).get("x-github-token");
    if (!token || token.length > 256)
      throw new AppError("localTokenRequired", 401);
    const identity = await github<{ id: number }>("/user", token);
    if (identity.id !== user.id) throw new AppError("reauthorize", 401);
    return token;
  }
  if (!env.TOKEN_ENCRYPTION_KEY || !user.token_encrypted)
    throw new AppError("authUnavailable", 503);
  return decryptToken(user.token_encrypted, env.TOKEN_ENCRYPTION_KEY);
}
export function cookieOptions(env: CloudflareEnv) {
  return {
    httpOnly: true,
    secure: new URL(env.APP_URL).protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
  };
}
