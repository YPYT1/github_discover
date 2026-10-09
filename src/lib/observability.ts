import { AsyncLocalStorage } from "node:async_hooks";

interface Trace {
  requestId: string;
  route: string;
  sampled: boolean;
  githubRequests: number;
  cacheHits: number;
  cacheMisses: number;
}
// OpenNext and the outer Worker bundle share a request-local context, not user data.
const key = Symbol.for("github-discover.observability.v1");
const host = globalThis as unknown as Record<symbol, AsyncLocalStorage<Trace>>;
// Lazy: shared pure helpers are also imported by the standalone demo. Do not
// instantiate server-only async hooks merely because a helper module is loaded.
function storage() {
  return (host[key] ??= new AsyncLocalStorage<Trace>());
}
function activeTrace() {
  return host[key]?.getStore();
}
const routes = new Set([
  "/api/feed",
  "/api/me",
  "/api/me/seen",
  "/api/me/repository",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
  "/api/auth/token",
  "/api/internal/sync",
]);
export function routeName(path: string) {
  if (routes.has(path)) return path;
  if (/^\/api\/repositories\/[^/]+\/[^/]+\/?$/.test(path))
    return "/api/repositories/:owner/:name";
  return "other";
}
const codes = new Set([
  "invalidRequest",
  "invalidSearch",
  "invalidCursor",
  "forbidden",
  "loginRequired",
  "localTokenRequired",
  "authDenied",
  "authFailed",
  "authUnavailable",
  "reauthorize",
  "notFound",
  "networkError",
  "rateLimited",
  "githubError",
  "serverError",
  "d1Error",
  "d1Schema",
  "d1Quota",
  "d1Busy",
  "timeout",
  "configMissing",
  "scheduledFailed",
]);
export function errorCategory(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    codes.has(String(error.code))
  )
    return String(error.code);
  if (error instanceof Error) {
    if (/D1_ERROR|SQLITE_|D1_EXEC_ERROR/.test(error.message)) {
      if (/no such table|no such column/i.test(error.message))
        return "d1Schema";
      if (/SQLITE_BUSY|SQLITE_LOCKED|overloaded|queue/i.test(error.message))
        return "d1Busy";
      if (/quota|exceeded.*limit|read.*limit|write.*limit/i.test(error.message))
        return "d1Quota";
      return "d1Error";
    }
    if (error.name === "TimeoutError" || error.name === "AbortError")
      return "timeout";
  }
  return "serverError";
}
const enums: Record<string, Set<string>> = {
  stage: new Set([
    "feed",
    "ranking",
    "repository_cache",
    "oauth",
    "scheduled_sync",
  ]),
  cache: new Set(["feed", "taste", "candidates", "recommendation", "trending"]),
  dependency: new Set(["github"]),
  endpoint: new Set([
    "search",
    "identity",
    "stars",
    "following",
    "repositories",
    "star",
    "other",
  ]),
  errorCode: codes,
  outcome: new Set(["ok", "error"]),
};
const numeric = new Set([
  "status",
  "durationMs",
  "count",
  "remaining",
  "resetAt",
  "retryAfter",
  "githubRequests",
  "cacheHits",
  "cacheMisses",
]);
type Event =
  | "request.completed"
  | "request.failed"
  | "application.error"
  | "dependency.completed"
  | "operation.completed"
  | "operation.failed"
  | "cache.lookup"
  | "scheduled.completed"
  | "scheduled.failed";
const events = new Set<Event>([
  "request.completed",
  "request.failed",
  "application.error",
  "dependency.completed",
  "operation.completed",
  "operation.failed",
  "cache.lookup",
  "scheduled.completed",
  "scheduled.failed",
]);
function safeFields(fields: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (
      numeric.has(name) &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    )
      safe[name] = Math.round(value);
    else if (enums[name] && typeof value === "string" && enums[name].has(value))
      safe[name] = value;
    else if (name === "hit" && typeof value === "boolean") safe[name] = value;
    else if (
      name === "relatedRequestId" &&
      typeof value === "string" &&
      /^[a-f0-9-]{36}$/.test(value)
    )
      safe[name] = value;
  }
  return safe;
}
export function sanitizeLogRecord(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (
    record.service !== "github-discover" ||
    !events.has(record.event as Event)
  )
    return null;
  const safe: Record<string, unknown> = {
    service: "github-discover",
    version: 1,
    event: record.event,
    ...safeFields(record),
  };
  if (["info", "warn", "error"].includes(String(record.level)))
    safe.level = record.level;
  if (
    typeof record.time === "string" &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(record.time)
  )
    safe.time = record.time;
  if (
    typeof record.requestId === "string" &&
    /^[a-f0-9-]{36}$/.test(record.requestId)
  )
    safe.requestId = record.requestId;
  if (typeof record.route === "string")
    safe.route =
      record.route === "scheduled"
        ? "scheduled"
        : record.route === "/api/repositories/:owner/:name"
          ? record.route
          : routeName(record.route);
  return safe;
}
export function logEvent(
  event: Event,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
  force = false,
) {
  const trace = activeTrace();
  if (level === "info" && !force && !trace?.sampled) return;
  const safe: Record<string, unknown> = {
    service: "github-discover",
    version: 1,
    event,
    level,
    time: new Date().toISOString(),
  };
  if (trace) {
    safe.requestId = trace.requestId;
    safe.route = trace.route;
  }
  Object.assign(safe, safeFields(fields));
  // Never throw because of a logging sink; no external network/write in this path.
  try {
    (level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log)(safe);
  } catch {
    /* Preserve request behavior. */
  }
}
export function requestId() {
  return activeTrace()?.requestId;
}
function traceFor(route: string, rate: unknown): Trace {
  const parsed = rate === undefined ? 0.05 : Number(rate);
  const sampleRate =
    Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.05;
  return {
    requestId: crypto.randomUUID(),
    route,
    sampled: Math.random() < sampleRate,
    githubRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}
export async function observeRequest(
  request: Request,
  env: { LOG_SAMPLE_RATE?: string },
  work: () => Promise<Response>,
) {
  const trace = traceFor(
    routeName(new URL(request.url).pathname),
    env.LOG_SAMPLE_RATE,
  );
  return storage().run(trace, async () => {
    const start = performance.now();
    let response: Response;
    try {
      response = await work();
    } catch (error) {
      logEvent("request.failed", { errorCode: errorCategory(error) }, "error");
      response = Response.json(
        { error: "serverError", requestId: trace.requestId },
        { status: 500 },
      );
    }
    const durationMs = performance.now() - start;
    const status = response.status;
    logEvent(
      "request.completed",
      {
        status,
        durationMs,
        githubRequests: trace.githubRequests,
        cacheHits: trace.cacheHits,
        cacheMisses: trace.cacheMisses,
      },
      status >= 500
        ? "error"
        : status >= 400 || durationMs >= 2000
          ? "warn"
          : "info",
    );
    const headers = new Headers(response.headers);
    headers.set("X-Request-ID", trace.requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}
export function recordCache(
  cache: "feed" | "taste" | "candidates" | "recommendation" | "trending",
  hit: boolean,
) {
  const trace = activeTrace();
  if (trace) {
    if (hit) trace.cacheHits++;
    else trace.cacheMisses++;
  }
  logEvent("cache.lookup", { cache, hit });
}
export function recordGitHub(fields: Record<string, unknown>, failed: boolean) {
  const trace = activeTrace();
  if (trace) trace.githubRequests++;
  logEvent(
    "dependency.completed",
    { dependency: "github", ...fields },
    failed ||
      (typeof fields.durationMs === "number" && fields.durationMs >= 2000)
      ? "warn"
      : "info",
  );
}
export async function observeOperation<T>(
  stage: "feed" | "ranking" | "repository_cache" | "oauth",
  work: () => T | Promise<T>,
  count?: number,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await work();
    const durationMs = performance.now() - start;
    logEvent(
      "operation.completed",
      { stage, durationMs, count },
      durationMs >= 2000 ? "warn" : "info",
    );
    return result;
  } catch (error) {
    logEvent(
      "operation.failed",
      {
        stage,
        durationMs: performance.now() - start,
        errorCode: errorCategory(error),
        count,
      },
      "error",
    );
    throw error;
  }
}
export async function observeScheduled(
  env: { LOG_SAMPLE_RATE?: string },
  work: () => Promise<string | null>,
) {
  return storage().run(traceFor("scheduled", env.LOG_SAMPLE_RATE), async () => {
    const start = performance.now();
    try {
      const relatedRequestId = await work();
      logEvent(
        "scheduled.completed",
        {
          stage: "scheduled_sync",
          durationMs: performance.now() - start,
          relatedRequestId,
        },
        "info",
        true,
      );
    } catch (error) {
      logEvent(
        "scheduled.failed",
        {
          stage: "scheduled_sync",
          durationMs: performance.now() - start,
          errorCode: errorCategory(error),
          ...(error && typeof error === "object"
            ? {
                status: "status" in error ? error.status : undefined,
                relatedRequestId:
                  "relatedRequestId" in error
                    ? error.relatedRequestId
                    : undefined,
              }
            : {}),
        },
        "error",
      );
      throw new Error("scheduled_sync_failed");
    }
  });
}
