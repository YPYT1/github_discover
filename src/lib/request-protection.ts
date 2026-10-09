const buckets = new Map<string, { count: number; until: number }>();
const WINDOW = 60000;
// Bounded isolate-local protection. Not a global WAF or strict account quota.
export function protectRequest(
  request: Request,
  now = Date.now(),
): Response | null {
  const path = new URL(request.url).pathname;
  if (
    !path.startsWith("/api/") ||
    path.startsWith("/api/internal/") ||
    path === "/api/auth/callback"
  )
    return null;
  const group =
    path === "/api/auth/token" || path === "/api/auth/login"
      ? "login"
      : path === "/api/feed"
        ? "feed"
        : request.method !== "GET"
          ? "write"
          : "read";
  const limit =
    group === "login"
      ? 10
      : group === "feed"
        ? 40
        : group === "write"
          ? 90
          : 120;
  // Cloudflare overwrites CF-Connecting-IP in production. Never log the key.
  const key = `${group}:${request.headers.get("cf-connecting-ip") ?? "local"}`;
  if (buckets.size >= 4096) {
    for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.until <= now) {
    if (!bucket && buckets.size >= 4096) return limited(60);
    bucket = { count: 0, until: now + WINDOW };
    buckets.set(key, bucket);
  }
  if (++bucket.count > limit)
    return limited(Math.max(1, Math.ceil((bucket.until - now) / 1000)));
  return null;
}
function limited(seconds: number) {
  return Response.json(
    { error: "rateLimited" },
    {
      status: 429,
      headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" },
    },
  );
}
