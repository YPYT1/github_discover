import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFilters, searchQuery } from "@/lib/filters";
import { columnCount, placeCards } from "@/lib/masonry";
import { encryptToken, decryptToken, hashToken } from "@/lib/crypto";
import { checkOrigin } from "@/lib/http";
import { normalizeRepository } from "@/lib/github";
import { matches } from "@/lib/feed";
import type { Repository } from "@/types";
import { matchLocale } from "@/lib/locale";
describe("browser language matching", () => {
  it.each([
    ["zh-TW,en-US", "zh-CN"],
    ["en-US", "en"],
    ["ja-JP,en", "ja"],
    ["ko-KR", "ko"],
    ["ru-RU", "ru"],
    ["fr-FR", "en"],
  ])("matches %s to %s", (input, locale) => {
    expect(matchLocale(input)).toBe(locale);
  });
});
describe("responsive masonry", () => {
  it.each([
    [375, 351, 1],
    [560, 536, 2],
    [768, 720, 2],
    [1024, 976, 3],
    [1440, 1392, 4],
    [1920, 1512, 4],
  ])("%ipx chooses columns", (viewport, container, expected) =>
    expect(columnCount(viewport, container)).toBe(expected),
  );
  it("fits narrower embedding containers", () =>
    expect(columnCount(1920, 540)).toBe(2));
  it("appending never moves existing cards", () => {
    const before = placeCards([320, 240, 440, 270], 3);
    const after = placeCards([320, 240, 440, 270, 350, 390], 3);
    expect(after.positions.slice(0, 4)).toEqual(before.positions);
    expect(after.height).toBeGreaterThan(before.height);
  });
  it("places unequal heights in the shortest column", () =>
    expect(placeCards([300, 200, 400, 100], 3).positions[3]).toEqual({
      column: 1,
      top: 216,
    }));
});
describe("filters and transport", () => {
  it("multi-select uses OR within groups and AND across groups", () => {
    const f = parseFilters(
      new URLSearchParams({
        language: "TypeScript,Python",
        category: "ai,tools",
      }),
    );
    const repo = {
      fullName: "test/repo",
      description: "",
      topics: ["machine-learning"],
      stars: 100,
      language: "Python",
    } as Repository;
    expect(matches(repo, f)).toBe(true);
    expect(matches({ ...repo, language: "Rust" }, f)).toBe(false);
    expect(matches({ ...repo, topics: ["game"] }, f)).toBe(false);
    expect(
      matches(
        { ...repo, language: "TypeScript", topics: ["developer-tools"] },
        f,
      ),
    ).toBe(true);
  });
  it("preserves GitHub syntax and safely quotes language", () => {
    const f = parseFilters(
      new URLSearchParams({
        q: "agent stars:>100",
        language: "C++",
        category: "ai",
      }),
    );
    const query = searchQuery(f);
    expect(query).toContain("agent stars:>100");
    expect(query).toContain('language:"C++"');
    expect(query).toContain("topic:machine-learning");
    expect(query).toContain("is:public");
  });
  const invalidFilters: Record<string, string>[] = [
    { tab: "invalid" },
    { minStars: "-1" },
    { period: "year" },
    { category: "anything" },
    { created: "not-a-date" },
    { license: "invalid" },
  ];
  it.each(invalidFilters)("rejects invalid filters", (params) =>
    expect(() => parseFilters(new URLSearchParams(params))).toThrow(),
  );
  it("rejects cross-origin and missing-origin writes", () => {
    expect(() =>
      checkOrigin(
        new Request("https://site.test", {
          headers: { origin: "https://evil.test" },
        }),
        "https://site.test",
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(new Request("https://site.test"), "https://site.test"),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request("https://site.test", {
          headers: { origin: "https://site.test" },
        }),
        "https://site.test",
      ),
    ).not.toThrow();
  });
  it("encrypts tokens with random IVs and detects tampering", async () => {
    const secret = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    );
    const encrypted = await encryptToken("test-only-credential", secret);
    expect(encrypted).not.toContain("test-only-credential");
    expect(await decryptToken(encrypted, secret)).toBe("test-only-credential");
    expect(await encryptToken("test-only-credential", secret)).not.toBe(
      encrypted,
    );
    await expect(
      decryptToken(encrypted, btoa("b".repeat(32))),
    ).rejects.toThrow();
    expect(await hashToken("session")).toHaveLength(64);
  });
  it("does not invent missing GitHub data", () => {
    const repo = normalizeRepository({
      id: 1,
      full_name: "owner/repo",
      name: "repo",
      owner: {
        login: "owner",
        avatar_url: "https://avatars.githubusercontent.com/u/1",
      },
      description: null,
      stargazers_count: 3,
      forks_count: 2,
      language: null,
      license: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      html_url: "https://github.com/owner/repo",
    });
    expect(repo.description).toBeNull();
    expect(repo.languages).toBeUndefined();
    expect(repo.growth).toBeUndefined();
    expect(repo.contributors).toBeUndefined();
  });
});
describe("translations", () => {
  function keys(value: Record<string, unknown>, prefix = ""): string[] {
    return Object.entries(value).flatMap(([key, entry]) =>
      entry && typeof entry === "object"
        ? keys(entry as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );
  }
  const english = JSON.parse(
    readFileSync("src/messages/en.json", "utf8"),
  ) as Record<string, unknown>;
  it.each(["zh-CN", "ja", "ko", "ru"])(
    "%s includes exactly the same translation keys",
    (locale) =>
      expect(
        keys(JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"))),
      ).toEqual(keys(english)),
  );
});
