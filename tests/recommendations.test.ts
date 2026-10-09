import { describe, it, expect } from "vitest";
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
