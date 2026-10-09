import assert from "node:assert/strict";
const base = process.env.WORKER_TEST_URL ?? "http://localhost:8787";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Load test is LOCAL ONLY",
);
const statuses = {};
let issued = 0,
  failed = false;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (!failed && issued < 200) {
      issued++;
      try {
        const response = await fetch(`${base}/api/me`, {
          signal: AbortSignal.timeout(10000),
        });
        const body = await response.text();
        if (
          /1102|Worker exceeded/i.test(body) ||
          ![200, 429].includes(response.status)
        )
          throw new Error("Local load check failed");
        assert.ok(response.headers.get("x-request-id"));
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      } catch {
        failed = true;
      }
    }
  }),
);
assert.equal(failed, false, "Unexpected failure; test stopped early");
assert.equal(issued, 200);
assert.ok(statuses[429] > 0, "Expected bounded rate protection");
console.log(
  JSON.stringify({
    localOnly: true,
    requests: issued,
    concurrency: 5,
    statuses,
  }),
);
