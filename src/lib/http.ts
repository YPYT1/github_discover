export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.code }, { status: error.status });
  console.error(
    "Request failed",
    error instanceof Error ? error.message : "unknown",
  );
  return Response.json({ error: "serverError" }, { status: 500 });
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
