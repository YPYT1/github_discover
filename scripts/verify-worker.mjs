import assert from "node:assert/strict";

const baseURL = process.env.WORKER_TEST_URL ?? "http://localhost:8787";
// Uses the actual compiled OpenNext handler and local D1, not network fixtures.
const account = await fetch(`${baseURL}/api/me`);
assert.equal(
  account.status,
  200,
  "Compiled Worker must load all required manifests and serve /api/me",
);
const identity = await account.json();
assert.equal(identity.user, null);
assert.equal(typeof identity.authConfigured, "boolean");
const home = await fetch(baseURL, { headers: { "accept-language": "en" } });
assert.equal(home.status, 200, "Cloudflare must serve the static homepage");
assert.match(await home.text(), /Discover repositories/);
assert.equal(home.headers.get("x-discover-delivery"), "static-home");
const cookieHome = await fetch(
  `${baseURL}/?q=typescript&language=TypeScript&repo=github/docs`,
  {
    headers: {
      cookie: "discover_session=invalid-test-session; discover_locale=zh-CN",
    },
  },
);
assert.equal(cookieHome.status, 200);
assert.equal(cookieHome.headers.get("x-discover-delivery"), "static-home");
const trend = await fetch(`${baseURL}/api/feed?tab=trending`);
assert.equal(trend.status, 200, "Compiled Worker must execute D1 queries");
const data = await trend.json();
assert.ok(Array.isArray(data.repositories));
const forbidden = await fetch(`${baseURL}/api/internal/sync`, {
  method: "POST",
});
assert.equal(forbidden.status, 403, "Sync must reject unauthenticated callers");
console.log(
  "PASS: static homepage with query/cookies, compiled Worker APIs, D1 and sync authorization",
);
const origin = process.env.WORKER_APP_ORIGIN ?? "http://localhost:3000";
const unseen = await fetch(`${baseURL}/api/me/seen`, {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({ ids: [1] }),
});
assert.equal(
  unseen.status,
  401,
  "Exposure writes require a signed-in database session",
);
const discover = async (seen) =>
  fetch(`${baseURL}/api/feed`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "tab=for-you", cursor: null, seen }),
  });
const first = await discover([]);
assert.equal(
  first.status,
  200,
  "Compiled recommendation endpoint must execute its D1 queries",
);
const batch = await first.json();
assert.ok(Array.isArray(batch.repositories));
const ids = batch.repositories.map((repo) => repo.id);
const second = await discover(ids);
assert.equal(second.status, 200);
assert.equal(
  (await second.json()).repositories.some((repo) => ids.includes(repo.id)),
  false,
  "Compiled recommendation endpoint must exclude anonymous seen IDs",
);
console.log(
  "PASS: compiled recommendation batches, seen exclusion and authenticated exposure boundary",
);
