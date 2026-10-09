import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { cacheRepositories } from "@/lib/repositories";
import { parseFilters } from "@/lib/filters";
import { feed } from "@/lib/feed";
import { hashToken } from "@/lib/crypto";
import type { Repository } from "@/types";
import type { UserRow } from "@/lib/auth";

const context = vi.hoisted(() => ({
  env: null as CloudflareEnv | null,
  jar: new Map<string, string>(),
  requestHeaders: new Headers(),
}));
vi.mock("@/lib/env", () => ({ getEnv: async () => context.env }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      context.jar.has(key) ? { value: context.jar.get(key) } : undefined,
    set: (key: string, value: string) => context.jar.set(key, value),
    delete: (key: string) => context.jar.delete(key),
  }),
  headers: async () => context.requestHeaders,
}));
import { POST as tokenLogin } from "@/app/api/auth/token/route";
import {
  POST as writeRepo,
  GET as repoState,
} from "@/app/api/me/repository/route";
import { PATCH as preference } from "@/app/api/me/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as oauthLogin } from "@/app/api/auth/login/route";
import { POST as seenWrite } from "@/app/api/me/seen/route";
import { POST as recommendationRequest } from "@/app/api/feed/route";

let mf: Miniflare;
let db: D1Database;
const pat = "test-only-credential-1234567890";
const repo: Repository = {
  id: 42,
  fullName: "test/repo",
  name: "repo",
  owner: "test",
  avatar: "https://avatars.githubusercontent.com/u/42",
  description: "database test",
  stars: 100,
  forks: 4,
  language: "TypeScript",
  topics: ["developer-tools"],
  license: "MIT",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  url: "https://github.com/test/repo",
};
function req(path: string, body: unknown, origin = "https://discover.test") {
  return new Request(`https://discover.test${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('test'); } }",
    d1Databases: { DB: "test-db" },
    compatibilityDate: "2026-07-30",
  });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const statement of (
    readFileSync("migrations/0001_initial.sql", "utf8") +
    readFileSync("migrations/0002_recommendations.sql", "utf8")
  )
    .split(";")
    .filter((sql) => sql.trim()))
    await db.prepare(statement).run();
  context.env = { DB: db, APP_URL: "https://discover.test" } as CloudflareEnv;
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await mf?.dispose();
});
beforeEach(async () => {
  delete context.env!.GITHUB_CLIENT_ID;
  delete context.env!.GITHUB_CLIENT_SECRET;
  delete context.env!.TOKEN_ENCRYPTION_KEY;
  vi.restoreAllMocks();
  context.jar.clear();
  context.requestHeaders = new Headers();
  await db.batch([
    db.prepare("DELETE FROM users"),
    db.prepare("DELETE FROM repositories"),
    db.prepare("DELETE FROM feed_cache"),
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/user"))
        return Response.json({
          id: 7,
          login: "tester",
          name: "Tester",
          avatar_url: "https://avatars.githubusercontent.com/u/7",
        });
      throw new Error("Unexpected network request in database test");
    }),
  );
});
it("OAuth account login redirects to GitHub with callback and a state cookie when configured", async () => {
  const unavailable = await oauthLogin(
    new Request("https://discover.test/api/auth/login"),
  );
  expect(unavailable.headers.get("location")).toContain("authUnavailable");
  context.env!.GITHUB_CLIENT_ID = "test-client";
  context.env!.GITHUB_CLIENT_SECRET = "test-secret";
  context.env!.TOKEN_ENCRYPTION_KEY = btoa("x".repeat(32));
  const response = await oauthLogin(
    new Request("https://discover.test/api/auth/login"),
  );
  const url = new URL(response.headers.get("location")!);
  expect(url.origin).toBe("https://github.com");
  expect(url.pathname).toBe("/login/oauth/authorize");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "https://discover.test/api/auth/callback",
  );
  expect(url.searchParams.get("state")).toBe(context.jar.get("discover_oauth"));
  expect(url.searchParams.get("scope")).toBe("");
});
it("PAT login never persists the credential, but saves identity and independent session", async () => {
  const response = await tokenLogin(req("/api/auth/token", { token: pat }));
  expect(response.status).toBe(200);
  const user = await db.prepare("SELECT * FROM users").first();
  expect(user?.token_encrypted).toBeNull();
  expect(JSON.stringify(user)).not.toContain(pat);
  expect(user?.login).toBe("tester");
  const session = await db.prepare("SELECT * FROM sessions").first();
  expect(session?.auth_method).toBe("pat");
  expect(JSON.stringify(session)).not.toContain(pat);
  expect(context.jar.get("discover_session")).not.toBe(pat);
});
it("persists idempotent exposures per user without inserting browsing history", async () => {
  expect((await seenWrite(req("/api/me/seen", { ids: [42] }))).status).toBe(
    401,
  );
  await tokenLogin(req("/api/auth/token", { token: pat }));
  expect(
    (await seenWrite(req("/api/me/seen", { ids: [42] }, "https://evil.test")))
      .status,
  ).toBe(403);
  expect((await seenWrite(req("/api/me/seen", { ids: [-1] }))).status).toBe(
    400,
  );
  await seenWrite(req("/api/me/seen", { ids: [42, 42] }));
  await seenWrite(req("/api/me/seen", { ids: [42] }));
  expect(
    (
      await db
        .prepare("SELECT * FROM recommendation_seen WHERE user_id=7")
        .all()
    ).results,
  ).toHaveLength(1);
  expect(
    (await db.prepare("SELECT * FROM browsing_history").all()).results,
  ).toHaveLength(0);
});
it("keeps recommendation pagination stable while exposures arrive; isolates cursor owners", async () => {
  await tokenLogin(req("/api/auth/token", { token: pat }));
  const pool = Array.from({ length: 60 }, (_, i) => ({
    ...repo,
    id: i + 100,
    fullName: `owner/repo-${i}`,
    name: `repo-${i}`,
  }));
  await cacheRepositories(db, pool);
  const f = parseFilters(new URLSearchParams());
  const user = await db
    .prepare("SELECT * FROM users WHERE id=7")
    .first<UserRow>();
  const first = await feed(context.env!, f, null, user);
  expect(first.repositories).toHaveLength(25);
  await seenWrite(
    req("/api/me/seen", { ids: first.repositories.map((r) => r.id) }),
  );
  const second = await feed(context.env!, f, first.nextCursor, user);
  expect(second.repositories).toHaveLength(25);
  expect(
    second.repositories.some((r) =>
      first.repositories.some((a) => a.id === r.id),
    ),
  ).toBe(false);
  await expect(
    feed(context.env!, f, first.nextCursor, { ...user!, id: 99 }),
  ).rejects.toThrow("invalidCursor");
  const reopened = await feed(context.env!, f, null, user);
  expect(
    reopened.repositories.some((r) =>
      first.repositories.some((a) => a.id === r.id),
    ),
  ).toBe(false);
}, 30000);
it("exhausts anonymous candidates without recycling and validates request bodies", async () => {
  await cacheRepositories(db, [repo]);
  const response = await recommendationRequest(
    req("/api/feed", { query: "tab=for-you", cursor: null, seen: [repo.id] }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    repositories: [],
    total: 0,
    nextCursor: null,
  });
  expect(
    (
      await recommendationRequest(
        req("/api/feed", { query: "q=rust", cursor: null, seen: [] }),
      )
    ).status,
  ).toBe(400);
});
it("uses PAT Stars and owned repositories for taste without persisting PAT or private repos", async () => {
  await tokenLogin(req("/api/auth/token", { token: pat }));
  context.requestHeaders.set("x-github-token", pat);
  const raw = (id: number, language: string, privateRepo = false) => ({
    id,
    name: `repo-${id}`,
    full_name: `tester/repo-${id}`,
    owner: { login: "tester", avatar_url: repo.avatar },
    description: "fixture",
    language,
    topics: ["systems"],
    private: privateRepo,
    stargazers_count: 400,
    forks_count: 5,
    license: { spdx_id: "MIT" },
    created_at: repo.createdAt,
    updated_at: repo.updatedAt,
    html_url: repo.url,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/user")) return Response.json({ id: 7 });
      if (url.includes("/user/starred?"))
        return Response.json([raw(10, "Rust"), raw(11, "Secret", true)]);
      if (url.includes("/users/tester/repos?"))
        return Response.json([raw(12, "Rust")]);
      return Response.json({ items: [raw(20, "Rust"), raw(21, "Python")] });
    }),
  );
  const user = {
    ...(await db.prepare("SELECT * FROM users WHERE id=7").first<UserRow>())!,
    auth_method: "pat" as const,
  };
  const data = await feed(
    context.env!,
    parseFilters(new URLSearchParams()),
    null,
    user,
  );
  expect(data.repositories[0].id).toBe(20);
  const stored = await db
    .prepare("SELECT data FROM feed_cache WHERE key='taste:7'")
    .first<{ data: string }>();
  expect(stored?.data).not.toContain(pat);
  expect(stored?.data).not.toContain("Secret");
});
it("preserves database save state when local PAT is unavailable for GitHub Star state", async () => {
  await tokenLogin(req("/api/auth/token", { token: pat }));
  await cacheRepositories(db, [repo]);
  await writeRepo(
    req("/api/me/repository", {
      name: repo.fullName,
      action: "save",
      enabled: true,
    }),
  );
  const response = await repoState(
    new Request(
      `https://discover.test/api/me/repository?name=${repo.fullName}`,
    ),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    saved: true,
    starred: null,
    starError: "localTokenRequired",
  });
});
it("rejects CSRF and unauthenticated writes", async () => {
  expect(
    (
      await tokenLogin(
        req("/api/auth/token", { token: pat }, "https://evil.test"),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await writeRepo(
        req("/api/me/repository", {
          name: repo.fullName,
          action: "save",
          enabled: true,
        }),
      )
    ).status,
  ).toBe(401);
});
it("saves, reads and removes user collections and preferences in D1", async () => {
  await tokenLogin(req("/api/auth/token", { token: pat }));
  await cacheRepositories(db, [repo]);
  expect(
    (
      await writeRepo(
        req("/api/me/repository", {
          name: repo.fullName,
          action: "save",
          enabled: true,
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await writeRepo(
        req("/api/me/repository", { name: repo.fullName, action: "history" }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await writeRepo(
        req("/api/me/repository", { name: repo.fullName, action: "dismiss" }),
      )
    ).status,
  ).toBe(200);
  const user = await db
    .prepare("SELECT * FROM users WHERE id=7")
    .first<UserRow>();
  const result = await feed(
    context.env!,
    parseFilters(new URLSearchParams({ tab: "saved" })),
    null,
    user,
  );
  expect(result.repositories[0].id).toBe(repo.id);
  expect(
    (await preference(req("/api/me", { locale: "zh-CN", theme: "dark" })))
      .status,
  ).toBe(200);
  expect(
    (await db.prepare("SELECT locale,theme FROM users WHERE id=7").first())
      ?.theme,
  ).toBe("dark");
  expect(
    (
      await writeRepo(
        req("/api/me/repository", {
          name: repo.fullName,
          action: "save",
          enabled: false,
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (await db.prepare("SELECT * FROM saved_repositories").all()).results,
  ).toHaveLength(0);
});
it("isolates private collections per user", async () => {
  await tokenLogin(req("/api/auth/token", { token: pat }));
  await cacheRepositories(db, [repo]);
  await writeRepo(
    req("/api/me/repository", {
      name: repo.fullName,
      action: "save",
      enabled: true,
    }),
  );
  const result = await feed(
    context.env!,
    parseFilters(new URLSearchParams({ tab: "saved" })),
    null,
    { id: 99 } as UserRow,
  );
  expect(result.total).toBe(0);
});
it("logout revokes the hashed database session", async () => {
  await tokenLogin(req("/api/auth/token", { token: pat }));
  const session = context.jar.get("discover_session")!;
  expect(
    await db
      .prepare("SELECT * FROM sessions WHERE token_hash=?")
      .bind(await hashToken(session))
      .first(),
  ).not.toBeNull();
  expect((await logout(req("/api/auth/logout", {}))).status).toBe(200);
  expect(context.jar.has("discover_session")).toBe(false);
  expect(
    (await db.prepare("SELECT * FROM sessions").all()).results,
  ).toHaveLength(0);
});
it("computes real growth from historical snapshots and waits for missing baselines", async () => {
  await cacheRepositories(db, [repo], true);
  let result = await feed(
    context.env!,
    parseFilters(new URLSearchParams({ tab: "trending" })),
    null,
    null,
  );
  expect(result.notice).toBe("trendPending");
  expect(result.repositories).toHaveLength(0);
  await db
    .prepare("INSERT INTO star_snapshots(repo_id,day,stars) VALUES(?,?,?)")
    .bind(
      repo.id,
      new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10),
      80,
    )
    .run();
  await db.prepare("DELETE FROM feed_cache").run();
  result = await feed(
    context.env!,
    parseFilters(new URLSearchParams({ tab: "trending" })),
    null,
    null,
  );
  expect(result.repositories[0].growth).toBe(20);
});
