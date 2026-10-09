import assert from "node:assert/strict";

const base =
  process.env.HOME_TEST_URL ?? "https://github-discover.ypyt147.workers.dev";
for (const period of ["day", "week", "month"]) {
  const response = await fetch(
    `${base}/api/feed?tab=trending&period=${period}`,
  );
  assert.equal(
    response.status,
    200,
    `Trending ${period} must respond successfully`,
  );
  const data = await response.json();
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
