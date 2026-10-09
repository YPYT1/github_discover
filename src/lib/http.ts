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
    return Response.json(
      { error: error.code },
      {
        status: error.status,
        headers: error.retryAfter
          ? {
              "Retry-After": String(error.retryAfter),
              "Cache-Control": "no-store",
            }
          : undefined,
      },
    );
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
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError("invalidRequest", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("invalidRequest");
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new AppError("invalidRequest", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AppError("invalidRequest");
  }
}
