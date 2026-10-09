import assert from "node:assert/strict";

const base =
  process.env.HOME_TEST_URL ?? "https://github-discover.ypyt147.workers.dev";
async function broadTrend(period) {
  let data;
  // Deployment propagation can briefly serve the previous Worker/cache version.
  // Only retry broad availability checks; never weaken assertions on growth/filter correctness.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(
      `${base}/api/feed?tab=trending&period=${period}`,
      { signal: AbortSignal.timeout(30000) },
    );
    const text = await response.text();
    assert.doesNotMatch(
      text,
      /1102|Worker exceeded/i,
      "Stop live checks on resource limit",
    );
    assert.ok(response.status < 500, "Stop live checks on server failure");
    if (response.ok) {
      data = JSON.parse(text);
      if (data.repositories?.length > 0) return data;
    }
    if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  assert.fail(
    `Trending ${period} has no broad results after bounded deployment retries`,
  );
}
for (const period of ["day", "week", "month"]) {
  const data = await broadTrend(period);
  assert.ok(
    data.repositories.length > 0,
    `Trending ${period} should have broad unfiltered results`,
  );
  if (data.notice === "trendFallback")
    assert.ok(
      data.repositories.every((r) => r.growth === undefined),
      "Fallback must not invent growth",
    );
  else
    assert.ok(
      data.repositories.every((r) => Number.isFinite(r.growth)),
      "Historical trends must include measured growth",
    );
  console.log(
    `PASS: ${period}, ${data.repositories.length} projects, ${data.notice ?? "measured-growth"}`,
  );
}
const response = await fetch(
  `${base}/api/feed?tab=trending&period=week&language=Rust&category=tools`,
);
assert.equal(response.status, 200);
const data = await response.json();
assert.ok(
  data.repositories.every(
    (r) => r.language === "Rust" && r.topics.includes("developer-tools"),
  ),
);
console.log(
  `PASS: language/category filters, ${data.repositories.length} matching projects`,
);
