import { copyFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const manifest = JSON.parse(
  readFileSync(".next/prerender-manifest.json", "utf8"),
);
assert.ok(
  manifest.routes["/"],
  "Refusing to deploy a request-rendered homepage",
);
assert.equal(manifest.routes["/"].initialRevalidateSeconds, false);
copyFileSync(".next/server/app/index.html", ".open-next/assets/index.html");
console.log(
  "Packaged Next.js prerendered homepage for Cloudflare asset-first delivery.",
);
