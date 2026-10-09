import {
  mkdirSync,
  readdirSync,
  statSync,
  appendFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { sanitizeLogRecord } from "../src/lib/observability.ts";
export function sanitizeDiagnostic(record) {
  const app = sanitizeLogRecord(record);
  if (app) return app;
  if (
    !record ||
    ![
      "ok",
      "exception",
      "exceededCpu",
      "exceededMemory",
      "canceled",
      "unknown",
    ].includes(record.outcome)
  )
    return null;
  const row = { time: new Date().toISOString(), outcome: record.outcome };
  if (typeof record.path === "string")
    row.path =
      record.path === "/api/repositories/:owner/:name"
        ? record.path
        : record.path === "/"
          ? "/"
          : [
                "/api/feed",
                "/api/me",
                "/api/me/seen",
                "/api/me/repository",
                "/api/internal/sync",
                "/api/auth/login",
                "/api/auth/callback",
                "/api/auth/logout",
                "/api/auth/token",
              ].includes(record.path)
            ? record.path
            : "other";
  for (const k of ["cpuMs", "wallMs", "exceptionCount"])
    if (
      typeof record[k] === "number" &&
      Number.isFinite(record[k]) &&
      record[k] >= 0
    )
      row[k] = record[k];
  if (
    [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
      "other",
    ].includes(record.method)
  )
    row.method = record.method;
  return row;
}
export function createArchive(directory, now = () => Date.now()) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const pattern = /^discover-\d{4}-\d{2}-\d{2}-\d{3}\.jsonl$/;
  let writes = 0;
  function prune() {
    const files = readdirSync(root)
      .filter((f) => pattern.test(f))
      .map((name) => ({ name, time: statSync(join(root, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const [i, file] of files.entries())
      if (i >= 40 || now() - file.time > 14 * 86400000)
        unlinkSync(join(root, file.name));
  }
  prune();
  return (record) => {
    const safe = sanitizeDiagnostic(record);
    if (!safe) return;
    const day = new Date(now()).toISOString().slice(0, 10);
    const line = JSON.stringify(safe) + "\n";
    for (let part = 0; part < 40; part++) {
      const path = join(
        root,
        `discover-${day}-${String(part).padStart(3, "0")}.jsonl`,
      );
      let size = 0;
      try {
        size = statSync(path).size;
      } catch {
        /* New part. */
      }
      if (size + Buffer.byteLength(line) <= 10 * 1024 * 1024) {
        appendFileSync(path, line, { mode: 0o600 });
        break;
      }
    }
    if (++writes % 100 === 0) prune();
  };
}
