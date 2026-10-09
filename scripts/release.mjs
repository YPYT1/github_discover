import { spawnSync, execFileSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && command === "pnpm",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Commit intentionally before releasing; never auto-stage secrets or unrelated work.
if (execFileSync("git", ["status", "--porcelain"]).toString().trim())
  throw new Error(
    "Commit changes before pnpm release. The release command never auto-stages files.",
  );
run("pnpm", ["test"]);
run("pnpm", ["lint"]);
run("pnpm", ["format:check"]);
run("pnpm", ["cf:build"]);
run("git", ["push", "origin", "HEAD"]);
run(process.execPath, [
  "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
  "deploy",
]);
run(process.execPath, ["--use-env-proxy", "scripts/verify-home-live.mjs"]);
run(process.execPath, ["--use-env-proxy", "scripts/verify-trends-live.mjs"]);
console.log(
  "Release complete: tested, pushed, deployed and homepage verified.",
);
