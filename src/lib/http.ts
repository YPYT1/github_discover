import { errorCategory, logEvent, requestId } from "./observability";
import { AppError } from "./app-error";
export { AppError } from "./app-error";
export function errorResponse(error: unknown) {
  logEvent(
    "application.error",
    {
      errorCode: errorCategory(error),
      status: error instanceof AppError ? error.status : 500,
    },
    error instanceof AppError && error.status < 500 ? "warn" : "error",
  );
  if (error instanceof AppError)
    return Response.json({ error: error.code }, { status: error.status });
  return Response.json(
    { error: "serverError", requestId: requestId() },
    { status: 500 },
  );
}
export function checkOrigin(request: Request, appUrl: string) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(appUrl).origin) throw new AppError("forbidden", 403);
}
export async function readBody(
  request: Request,
  limit = 4096,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("invalidRequest");
  const text = await request.text();
  if (text.length > limit) throw new AppError("invalidRequest");
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AppError("invalidRequest");
  }
}
