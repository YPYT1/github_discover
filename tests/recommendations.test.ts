import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  addTaste,
  emptyTaste,
  rankRecommendations,
} from "@/lib/recommendation-ranking";
import { isRecommendation } from "@/lib/recommendations";
import { parseFilters } from "@/lib/filters";
import type { Repository } from "@/types";
const now = Date.parse("2026-10-09T00:00:00Z");
function repo(id: number, language = "Rust", stars = 300): Repository {
  return {
    id,
    name: `repo-${id}`,
    fullName: `owner-${id}/repo`,
    owner: `owner-${id}`,
    avatar: "https://avatars.githubusercontent.com/u/1",
    description: "fixture",
    language,
    stars,
    forks: 5,
    topics: [language === "Rust" ? "systems" : "frontend"],
    license: "MIT",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    url: "https://github.com/test/repo",
  };
}
describe("recommendation ranking", () => {
  it("normalizes rich profiles only once and preserves the legacy ranking exactly", () => {
    const taste = emptyTaste();
    for (let i = 0; i < 1500; i++) taste.topics[`topic-${i}`] = 1 + (i % 10);
    for (let i = 0; i < 30; i++) taste.languages[`lang-${i}`] = 1 + i;
    const pool = Array.from({ length: 1500 }, (_, i) => ({
      ...repo(i + 1, `lang-${i % 30}`, 1000),
      owner: `owner-${i % 100}`,
      topics: Array.from({ length: 8 }, (_, j) => `topic-${(i + j) % 1500}`),
    }));
    const scan = vi.spyOn(Object, "values");
    let ranked: Repository[];
    try {
      ranked = rankRecommendations(pool, taste, new Set(), "fixed", now);
      expect(scan).toHaveBeenCalledTimes(3);
    } finally {
      scan.mockRestore();
    }
    expect(ranked).toHaveLength(600);
    // Golden digest generated from the pre-optimization implementation, with fixed time/seed.
    expect(
      createHash("sha256")
        .update(JSON.stringify(ranked.map((r) => r.id)))
        .digest("hex"),
    ).toBe("77e8031db3a9d2bcea0f400a9ac9dd57605d22fb0aeb0193ced548a5afcbc958");
  });
  it("ranks stack match above unmatched fame", () => {
    const taste = emptyTaste();
    addTaste(taste, repo(1), 6);
    const ranked = rankRecommendations(
      [repo(2, "JavaScript", 200000), repo(3)],
      taste,
      new Set(),
      "seed",
      now,
    );
    expect(ranked[0].id).toBe(3);
  });
  it("uses Topics as well as primary language", () => {
    const taste = emptyTaste();
    addTaste(taste, repo(1), 6);
    const matching = { ...repo(2, "Python"), topics: ["systems"] };
    expect(
      rankRecommendations(
        [matching, repo(3, "JavaScript")],
        taste,
        new Set(),
        "seed",
        now,
      )[0].id,
    ).toBe(2);
  });
  it("never resurrects seen IDs or duplicate candidates", () => {
    expect(
      rankRecommendations(
        [repo(1), repo(2), repo(2)],
        emptyTaste(),
        new Set([1]),
        "seed",
        now,
      ).map((r) => r.id),
    ).toEqual([2]);
    expect(
      rankRecommendations([repo(1)], emptyTaste(), new Set([1]), "seed", now),
    ).toEqual([]);
  });
  it("rotates equal-quality candidates across batches but is stable within one", () => {
    const pool = Array.from({ length: 40 }, (_, i) => repo(i + 1));
    const a = rankRecommendations(
      pool,
      emptyTaste(),
      new Set(),
      "one",
      now,
    ).map((r) => r.id);
    expect(
      rankRecommendations(pool, emptyTaste(), new Set(), "one", now).map(
        (r) => r.id,
      ),
    ).toEqual(a);
    expect(
      rankRecommendations(pool, emptyTaste(), new Set(), "two", now).map(
        (r) => r.id,
      ),
    ).not.toEqual(a);
  });
  it("reduces dismissed similarity and repeated owners", () => {
    const taste = emptyTaste();
    addTaste(taste, repo(1), 6, true);
    expect(
      rankRecommendations(
        [repo(2), repo(3, "Python")],
        taste,
        new Set(),
        "seed",
        now,
      )[0].id,
    ).toBe(3);
    const pool = Array.from({ length: 20 }, (_, i) => ({
      ...repo(i + 1),
      owner: i < 10 ? "same-owner" : `other-${i}`,
    }));
    expect(
      rankRecommendations(pool, emptyTaste(), new Set(), "seed", now)
        .slice(0, 5)
        .filter((r) => r.owner === "same-owner").length,
    ).toBeLessThan(3);
  });
  it("does not change search or explicitly chosen sort behavior", () => {
    expect(isRecommendation(parseFilters(new URLSearchParams()))).toBe(true);
    expect(
      isRecommendation(parseFilters(new URLSearchParams({ q: "rust" }))),
    ).toBe(false);
    expect(
      isRecommendation(parseFilters(new URLSearchParams({ sort: "stars" }))),
    ).toBe(false);
    expect(
      isRecommendation(parseFilters(new URLSearchParams({ tab: "history" }))),
    ).toBe(false);
  });
});
