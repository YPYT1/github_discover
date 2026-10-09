import { afterEach, describe, expect, it, vi } from "vitest";
import {
  errorCategory,
  logEvent,
  observeOperation,
  observeRequest,
  observeScheduled,
  recordCache,
  requestId,
  routeName,
  sanitizeLogRecord,
} from "@/lib/observability";
import { AppError, errorResponse } from "@/lib/http";
import { githubResponse } from "@/lib/github";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function capture() {
  const info = vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return () =>
    [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls].map((call) =>
      typeof call[0] === "string" ? JSON.parse(call[0]) : call[0],
    );
}
describe("privacy-safe request observability", () => {
  it.each([
    ["D1_ERROR: no such table: private_users", "d1Schema"],
    ["D1_ERROR: SQL read quota exceeded", "d1Quota"],
    ["D1_ERROR: SQLITE_BUSY secret-query", "d1Busy"],
  ])("classifies database failures without disclosing %s", (message, code) => {
    expect(errorCategory(new Error(message))).toBe(code);
  });
  it("correlates logs and response using a generated ID; never trusts external identifiers or captures input", async () => {
    const logs = capture();
    const req = new Request(
      "https://test/api/auth/callback?code=TOP_SECRET&state=PRIVATE",
      {
        headers: {
          cookie: "secret-cookie",
          authorization: "secret-token",
          "x-request-id": "injected",
        },
      },
    );
    const response = await observeRequest(
      req,
      { LOG_SAMPLE_RATE: "1" },
      async () => {
        recordCache("feed", true);
        logEvent(
          "application.error",
          {
            errorCode: "d1Error",
            message: "TOP_SECRET",
            token: "secret-token",
            cookie: "secret-cookie",
            query: "PRIVATE",
          },
          "error",
        );
        return new Response("body", {
          headers: { "Set-Cookie": "session=PRIVATE; HttpOnly" },
        });
      },
    );
    const id = response.headers.get("x-request-id");
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(logs().every((row) => row.requestId === id)).toBe(true);
    expect(
      logs().find((row) => row.event === "request.completed").cacheHits,
    ).toBe(1);
    expect(JSON.stringify(logs())).not.toMatch(
      /TOP_SECRET|secret-token|secret-cookie|PRIVATE|injected/,
    );
    expect(await response.text()).toBe("body");
    expect(response.headers.get("set-cookie")).toContain("PRIVATE");
  });
  it("samples successful requests but always logs errors at sample rate zero", async () => {
    const logs = capture();
    await observeRequest(
      new Request("https://test/api/me"),
      { LOG_SAMPLE_RATE: "0" },
      async () => new Response("ok"),
    );
    expect(logs()).toEqual([]);
    await observeRequest(
      new Request("https://test/api/me"),
      { LOG_SAMPLE_RATE: "0" },
      async () =>
        errorResponse(
          new Error("D1_ERROR: SELECT secret_token FROM private_users"),
        ),
    );
    expect(logs().some((row) => row.errorCode === "d1Error")).toBe(true);
    expect(logs().find((row) => row.event === "request.completed").status).toBe(
      500,
    );
    expect(JSON.stringify(logs())).not.toContain("secret_token");
  });
  it("isolates request contexts under concurrent async work", async () => {
    const logs = capture();
    const responses = await Promise.all(
      ["/api/me", "/api/feed"].map((path) =>
        observeRequest(
          new Request(`https://test${path}`),
          { LOG_SAMPLE_RATE: "1" },
          async () => {
            const id = requestId();
            await Promise.resolve();
            expect(requestId()).toBe(id);
            return Response.json({ id });
          },
        ),
      ),
    );
    expect(responses[0].headers.get("x-request-id")).not.toBe(
      responses[1].headers.get("x-request-id"),
    );
    for (let i = 0; i < responses.length; i++) {
      const id = responses[i].headers.get("x-request-id");
      expect(logs().find((row) => row.requestId === id).route).toBe(
        i ? "/api/feed" : "/api/me",
      );
    }
  });
  it("sanitizes an unhandled exception without changing status to success", async () => {
    const logs = capture();
    const response = await observeRequest(
      new Request(
        "https://test/api/repositories/private-owner/private-name?token=TOP_SECRET",
      ),
      { LOG_SAMPLE_RATE: "0" },
      async () => {
        throw new Error("TOP_SECRET");
      },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "serverError",
      requestId: response.headers.get("x-request-id"),
    });
    expect(logs()[0].route).toBe("/api/repositories/:owner/:name");
    expect(JSON.stringify(logs())).not.toMatch(
      /TOP_SECRET|private-owner|private-name/,
    );
  });
  it("logs dependency quota and duration without URL, response body, or token", async () => {
    const logs = capture();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("secret-body", {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "1800000000",
              "retry-after": "60",
            },
          }),
      ),
    );
    await observeRequest(
      new Request("https://test/api/feed"),
      { LOG_SAMPLE_RATE: "0" },
      async () => {
        try {
          await githubResponse(
            "/search/repositories?q=private-search",
            "TOP_SECRET",
          );
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          return errorResponse(error);
        }
        throw new Error("Expected rate limit");
      },
    );
    const dependency = logs().find(
      (row) => row.event === "dependency.completed",
    );
    expect(dependency).toMatchObject({
      endpoint: "search",
      status: 403,
      errorCode: "rateLimited",
      remaining: 0,
      retryAfter: 60,
    });
    expect(
      logs().find((row) => row.event === "request.completed").githubRequests,
    ).toBe(1);
    expect(JSON.stringify(logs())).not.toMatch(
      /private-search|TOP_SECRET|secret-body/,
    );
  });
  it("records dependency timeout and operation failure safely", async () => {
    const logs = capture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("secret-token", "TimeoutError");
      }),
    );
    await expect(githubResponse("/user", "TOP_SECRET")).rejects.toThrow(
      "networkError",
    );
    await expect(
      observeOperation("repository_cache", () => {
        throw new Error("D1_ERROR: TOP_SECRET");
      }),
    ).rejects.toThrow("D1_ERROR");
    expect(logs().some((row) => row.errorCode === "timeout")).toBe(true);
    expect(
      logs().some(
        (row) =>
          row.stage === "repository_cache" && row.errorCode === "d1Error",
      ),
    ).toBe(true);
    expect(JSON.stringify(logs())).not.toContain("TOP_SECRET");
  });
  it("logs scheduled success even when unsampled and links its HTTP request", async () => {
    const logs = capture();
    const id = crypto.randomUUID();
    await observeScheduled({ LOG_SAMPLE_RATE: "0" }, async () => id);
    expect(logs()[0]).toMatchObject({
      event: "scheduled.completed",
      route: "scheduled",
      relatedRequestId: id,
    });
    await expect(
      observeScheduled({}, async () => {
        throw new Error("TOP_SECRET");
      }),
    ).rejects.toThrow("scheduled_sync_failed");
    expect(logs().some((row) => row.event === "scheduled.failed")).toBe(true);
    expect(JSON.stringify(logs())).not.toContain("TOP_SECRET");
  });
  it("filters arbitrary log messages and unsafe fields in the diagnostic tool", () => {
    expect(sanitizeLogRecord({ message: "TOP_SECRET" })).toBeNull();
    expect(
      sanitizeLogRecord({ service: "github-discover", event: "TOP_SECRET" }),
    ).toBeNull();
    const clean = sanitizeLogRecord({
      service: "github-discover",
      event: "application.error",
      errorCode: "TOP_SECRET",
      message: "TOP_SECRET",
      requestId: "injected",
      route: "/api/repositories/private/name",
      count: NaN,
      status: 500,
      headers: { Authorization: "TOP_SECRET" },
    });
    expect(clean).toMatchObject({
      status: 500,
      route: "/api/repositories/:owner/:name",
    });
    expect(JSON.stringify(clean)).not.toMatch(/TOP_SECRET|injected|private/);
    expect(routeName("/unknown/private")).toBe("other");
    expect(
      errorCategory(
        Object.assign(new Error("TOP_SECRET"), { code: "TOP_SECRET" }),
      ),
    ).toBe("serverError");
  });
  it("logging sink failure never breaks the request", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("sink offline");
    });
    const response = await observeRequest(
      new Request("https://test/api/me"),
      { LOG_SAMPLE_RATE: "1" },
      async () => new Response("ok"),
    );
    expect(response.status).toBe(200);
  });
});
