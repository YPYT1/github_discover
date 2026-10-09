import { it, expect, vi } from "vitest";
import { githubResponse } from "@/lib/github";
it("uses a safe sixty-second quota cooldown when upstream omits retry headers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 429 })),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await expect(
      githubResponse("/search/repositories?q=test"),
    ).rejects.toMatchObject({ code: "rateLimited", retryAfter: 60 });
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
import { protectRequest } from "@/lib/request-protection";
import { readBody } from "@/lib/http";
import { parseFilters } from "@/lib/filters";
it("rejects excessive filter fan-out rather than silently dropping selected filters", () => {
  expect(() =>
    parseFilters(
      new URLSearchParams({
        language: "Rust,Go,Python,TypeScript,Java",
        category: "tools,web,ai,cli",
      }),
    ),
  ).toThrow("filterLimit");
  expect(
    parseFilters(
      new URLSearchParams({ language: "Rust,Go", category: "tools,web" }),
    ).language,
  ).toBe("Rust,Go");
});
it("limits streaming JSON bodies even without a Content-Length header", async () => {
  const request = new Request("https://test/api/feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(100) }),
  });
  await expect(readBody(request, 32)).rejects.toMatchObject({
    status: 413,
    code: "invalidRequest",
  });
  const valid = new Request("https://test/api/feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "你好" }),
  });
  expect(await readBody(valid)).toEqual({ text: "你好" });
});
it("bounds request groups and resets windows without logging or storing credentials", () => {
  const request = new Request("https://test/api/feed", {
    headers: { "cf-connecting-ip": "192.0.2.1", Authorization: "private" },
  });
  const now = 100000;
  for (let i = 0; i < 40; i++) expect(protectRequest(request, now)).toBeNull();
  const blocked = protectRequest(request, now)!;
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBe("60");
  expect(protectRequest(request, now + 60001)).toBeNull();
  expect(
    protectRequest(new Request("https://test/api/internal/sync"), now),
  ).toBeNull();
  expect(protectRequest(new Request("https://test/"), now)).toBeNull();
  expect(
    protectRequest(
      new Request("https://test/api/feed", {
        headers: { "cf-connecting-ip": "192.0.2.2" },
      }),
      now,
    ),
  ).toBeNull();
});
