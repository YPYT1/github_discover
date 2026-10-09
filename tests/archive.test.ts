import { it, expect } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
// @ts-expect-error Local ESM utility used by scripts, intentionally not in app types.
import { createArchive, sanitizeDiagnostic } from "../scripts/log-archive.mjs";
it("archives only sanitized records and rotates retained files without touching unrelated files", () => {
  const directory = mkdtempSync("D:/USER_TEMP/opencode/discover-archive-test-");
  try {
    const old = join(directory, "discover-2020-01-01-000.jsonl");
    writeFileSync(old, "old");
    utimesSync(old, 0, 0);
    writeFileSync(join(directory, "unrelated.txt"), "keep");
    const append = createArchive(directory);
    append({
      service: "github-discover",
      event: "application.error",
      errorCode: "rateLimited",
      token: "TOP_SECRET",
      message: "PRIVATE",
    });
    expect(sanitizeDiagnostic({ message: "TOP_SECRET" })).toBeNull();
    const files = readdirSync(directory);
    expect(files).not.toContain("discover-2020-01-01-000.jsonl");
    expect(files).toContain("unrelated.txt");
    const content = readFileSync(
      join(
        directory,
        files.find((f) => f.endsWith(".jsonl"))!,
      ),
      "utf8",
    );
    expect(content).toContain("rateLimited");
    expect(content).not.toMatch(/TOP_SECRET|PRIVATE/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
