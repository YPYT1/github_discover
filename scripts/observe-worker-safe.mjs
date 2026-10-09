import { spawn } from "node:child_process";

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
      console.log(
        JSON.stringify({
          outcome: event.outcome,
          path: event.event?.request?.url
            ? new URL(event.event.request.url).pathname
            : null,
          method: event.event?.request?.method,
          cpuMs: event.cpuTime,
          wallMs: event.wallTime,
          exceptionCount: event.exceptions?.length ?? 0,
        }),
      );
    } catch {
      /* Ignore Wrangler banners, not application logs. */
    }
  }
});
child.stderr.on("data", () => {});
const timer = setTimeout(() => child.kill(), 240000);
child.on("exit", () => clearTimeout(timer));
console.log("Sanitized Worker resource diagnostics active for four minutes.");
