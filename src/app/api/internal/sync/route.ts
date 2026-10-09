import { getEnv } from "@/lib/env";
import { errorResponse, AppError } from "@/lib/http";
import { hashToken } from "@/lib/crypto";
import { syncRepositories, operationReport } from "@/lib/sync";
async function authorized(request: Request) {
  const env = await getEnv();
  if (
    !env.CRON_SECRET ||
    (await hashToken(request.headers.get("authorization") ?? "")) !==
      (await hashToken(`Bearer ${env.CRON_SECRET}`))
  )
    throw new AppError("forbidden", 403);
  return env;
}
export async function POST(request: Request) {
  try {
    return Response.json(await syncRepositories(await authorized(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function GET(request: Request) {
  try {
    return Response.json(await operationReport(await authorized(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
