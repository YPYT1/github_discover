import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { hashToken } from "@/lib/crypto";
import { checkOrigin, errorResponse } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    checkOrigin(request, env.APP_URL);
    const jar = await cookies();
    const token = jar.get("discover_session")?.value;
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hashToken(token))
        .run();
    jar.delete("discover_session");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
