import assert from "node:assert/strict";

const base =
  process.env.HOME_TEST_URL ?? "https://github-discover.ypyt147.workers.dev";
let publicDocument;
for (const locale of ["en", "zh-CN", "ja", "ko", "ru"]) {
  for (const withSession of [false, true]) {
    const url = `${base}/?tab=for-you&language=&category=all&sort=recommended&period=week&minStars=0&license=&created=&updated=`;
    const response = await fetch(url, {
      headers: {
        "accept-language": locale,
        cookie: `discover_locale=${locale}${withSession ? "; discover_session=invalid-regression-session" : ""}`,
      },
    });
    const body = await response.text();
    assert.equal(
      response.status,
      200,
      `${locale}, session cookie ${withSession}`,
    );
    assert.doesNotMatch(body, /Error 1102|Worker exceeded resource limits/);
    assert.equal(response.headers.get("x-discover-delivery"), "static-home");
    assert.match(body, /Discover repositories/);
    publicDocument ??= body;
    assert.equal(
      body,
      publicDocument,
      "Public homepage must not contain cookie-specific or account-specific content",
    );
  }
}
console.log(
  "PASS: 10 live homepage requests, five locales with/without session-shaped cookies, identical static HTML, no 1102. Actual account login still requires user acceptance.",
);
