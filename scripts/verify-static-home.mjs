import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(".next/prerender-manifest.json", "utf8"),
);
assert.ok(
  manifest.routes["/"],
  "Homepage must be prerendered, not rendered per request",
);
assert.equal(
  manifest.routes["/"].initialRevalidateSeconds,
  false,
  "Homepage must not require runtime regeneration",
);
const html = readFileSync(".next/server/app/index.html", "utf8");
assert.equal(
  readFileSync(".open-next/assets/index.html", "utf8"),
  html,
  "Cloudflare must receive the actual prerendered HTML",
);
assert.match(html, /Discover repositories/);
assert.doesNotMatch(html, /discover_session|token_encrypted|github_pat_/);
const headers = readFileSync(".open-next/assets/_headers", "utf8");
assert.match(headers, /X-Discover-Delivery: static-home/);
const config = JSON.parse(
  readFileSync("wrangler.jsonc", "utf8").replace(/,\s*([}\]])/g, "$1"),
);
assert.deepEqual(
  config.assets.run_worker_first,
  ["/api/*"],
  "APIs must enter the Worker; homepage must be served asset-first",
);
console.log(
  "PASS: prerendered public homepage, identical static asset, API-only Worker routing",
);
