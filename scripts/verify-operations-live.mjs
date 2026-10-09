import assert from "node:assert/strict";
const base =
  process.env.HOME_TEST_URL ?? "https://github-discover.ypyt147.workers.dev";
const denied = await fetch(`${base}/api/internal/sync`, {
  signal: AbortSignal.timeout(15000),
});
assert.equal(denied.status, 403, "Operational diagnostics must be private");
assert.ok(denied.headers.get("x-request-id"));
if (!process.env.CRON_SECRET)
  throw new Error("CRON_SECRET required for authorized deployment check");
const response = await fetch(`${base}/api/internal/sync`, {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  redirect: "error",
  signal: AbortSignal.timeout(20000),
});
assert.equal(response.status, 200);
const data = await response.json();
assert.equal(typeof data.tokenConfigured, "boolean");
assert.equal(data.externalAlertsEnabled, false);
assert.ok(Array.isArray(data.snapshotDays));
assert.ok(Array.isArray(data.alerts));
console.log(
  JSON.stringify({
    operationsCheck: "passed",
    tokenConfigured: data.tokenConfigured,
    collectionOverdue: data.collectionOverdue,
    coverage: data.coverage,
    externalAlertsEnabled: data.externalAlertsEnabled,
  }),
);
