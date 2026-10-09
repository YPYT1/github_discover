import { spawn } from "node:child_process";
import { sanitizeLogRecord } from "../src/lib/observability.ts";
import { createArchive } from "./log-archive.mjs";
const archive = process.argv.includes("--archive")
  ? createArchive(
      process.env.LOG_ARCHIVE_DIR ??
        "D:/USER_TEMP/opencode/github-discover-logs",
    )
  : null;
function emit(record) {
  console.log(JSON.stringify(record));
  if (archive) {
    try {
      archive(record);
    } catch {
      console.error("Local log archive write failed; live tail continues.");
    }
  }
}

// Request diagnostics only. Never print request headers, cookies, query strings,
// application log payloads, authorization codes, or credentials.
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "tail",
    "github-discover",
    "--format",
    "json",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  if (buffer.length > 1048576) {
    buffer = "";
    console.warn("Dropped oversized diagnostic record.");
    return;
  }
  for (;;) {
    const start = buffer.indexOf("{");
    if (start < 0) {
      buffer = "";
      break;
    }
    let depth = 0,
      quoted = false,
      escaped = false,
      end = -1;
    for (let i = start; i < buffer.length; i++) {
      const char = buffer[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) break;
    const text = buffer.slice(start, end + 1);
    buffer = buffer.slice(end + 1);
    try {
      const event = JSON.parse(text);
      emit({
        outcome: event.outcome,
        path: event.event?.request?.url
          ? sanitizePath(new URL(event.event.request.url).pathname)
          : null,
        method: [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
          "OPTIONS",
        ].includes(event.event?.request?.method)
          ? event.event.request.method
          : "other",
        cpuMs: event.cpuTime,
        wallMs: event.wallTime,
        exceptionCount: event.exceptions?.length ?? 0,
      });
      for (const log of event.logs ?? []) {
        for (const message of log.message ?? []) {
          try {
            const safe = sanitizeLogRecord(
              typeof message === "string" ? JSON.parse(message) : message,
            );
            if (safe) emit(safe);
          } catch {
            /* Never forward arbitrary log text. */
          }
        }
      }
    } catch {
      /* Ignore Wrangler banners, not application logs. */
    }
  }
});
child.stderr.on("data", () => {});
const seconds = Number(process.env.LOG_TAIL_SECONDS ?? 0);
const timer =
  seconds > 0 && Number.isFinite(seconds)
    ? setTimeout(() => child.kill(), Math.min(seconds, 86400) * 1000)
    : null;
child.on("exit", (code) => {
  clearTimeout(timer);
  if (code !== null && code !== 0) {
    console.error(
      "Wrangler tail failed; check Cloudflare login and Worker read permissions.",
    );
    process.exitCode = code;
  }
});
child.on("error", () => {
  console.error("Unable to start Wrangler tail.");
  process.exitCode = 1;
});
process.on("SIGINT", () => child.kill());
console.log(
  "Sanitized Worker diagnostics active; Ctrl+C to stop. LOG_TAIL_SECONDS sets an optional time limit.",
);
function sanitizePath(path) {
  if (/^\/api\/repositories\/[^/]+\/[^/]+\/?$/.test(path))
    return "/api/repositories/:owner/:name";
  const allowed = new Set([
    "/api/feed",
    "/api/me",
    "/api/me/seen",
    "/api/me/repository",
    "/api/auth/login",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/auth/token",
    "/api/internal/sync",
    "/",
    "/favicon.ico",
  ]);
  return allowed.has(path) ? path : "other";
}
