import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 600 },
});
const page = await context.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
// Test-only network fixtures. Production never imports or serves these records.
const repositories = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  fullName: `test-owner/test-repository-${index}`,
  owner: "test-owner",
  name: `test-repository-${index}`,
  avatar: "https://avatars.githubusercontent.com/u/9919",
  description:
    "Test fixture: " +
    "Open-source repository with a variable-length description. ".repeat(
      (index % 4) + 1,
    ),
  stars: 1000 + index,
  forks: 20,
  language: "TypeScript",
  topics: ["developer-tools", "typescript"],
  license: "MIT",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  url: "https://github.com/github/docs",
}));
await page.route("**/api/me", (route) =>
  route.fulfill({ json: { user: null, authConfigured: false } }),
);
await page.route("**/api/feed?**", (route) => {
  const params = new URL(route.request().url()).searchParams;
  if (params.get("q") === "network-failure")
    return route.fulfill({ status: 429, json: { error: "rateLimited" } });
  if (params.get("q") === "no-results")
    return route.fulfill({
      json: { repositories: [], total: 0, nextCursor: null },
    });
  const body =
    route.request().method() === "POST" ? route.request().postDataJSON() : null;
  const offset = body?.cursor || params.has("cursor") ? 6 : 0;
  return route.fulfill({
    json: {
      repositories: repositories
        .slice(offset, offset + 6)
        .filter((repo) => !body?.seen.includes(repo.id)),
      total: 12,
      nextCursor: offset ? null : "test-cursor",
    },
  });
});
await page.route("**/api/repositories/**", (route) =>
  route.fulfill({
    json: {
      ...repositories[0],
      languages: { TypeScript: 90, JavaScript: 10 },
      contributors: 3,
    },
  }),
);
await mkdir("output/playwright", { recursive: true });
try {
  await page.goto(baseURL);
  await page.locator("article").first().waitFor();
  await page.waitForFunction(
    () => document.querySelector(".masonry")?.dataset.ready === "true",
  );
  for (const [width, expected] of [
    [375, 1],
    [600, 2],
    [768, 2],
    [1024, 3],
    [1440, 4],
    [1920, 4],
  ]) {
    await page.setViewportSize({ width, height: 600 });
    await page.waitForFunction((count) => {
      const cards = [...document.querySelectorAll(".masonry-item")];
      const container = document.querySelector(".masonry");
      const expectedWidth = (container.clientWidth - (count - 1) * 16) / count;
      return (
        Math.abs(cards[0].getBoundingClientRect().width - expectedWidth) < 1 &&
        new Set(
          cards
            .slice(0, count)
            .map((card) => Math.round(card.getBoundingClientRect().left)),
        ).size === count
      );
    }, expected);
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      console.log(
        await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (element) =>
                element.getBoundingClientRect().right > innerWidth + 1,
            )
            .slice(0, 15)
            .map((element) => ({
              tag: element.tagName,
              cls: element.className,
              right: element.getBoundingClientRect().right,
            })),
        ),
      );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `horizontal overflow at ${width}`,
    );
    console.log(
      `PASS: ${width}px, ${expected} columns, no horizontal overflow`,
    );
    if ([375, 1440].includes(width))
      await page.screenshot({ path: `output/playwright/${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector(".masonry-item").getBoundingClientRect().width -
          (document.querySelector(".masonry").clientWidth - 48) / 4,
      ) < 1,
  );
  const before = await page
    .locator(".masonry-item")
    .evaluateAll((cards) =>
      cards.slice(0, 6).map((card) => card.style.transform),
    );
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelectorAll("article").length === 12,
  );
  assert.deepEqual(
    await page
      .locator(".masonry-item")
      .evaluateAll((cards) =>
        cards.slice(0, 6).map((card) => card.style.transform),
      ),
    before,
  );
  console.log("PASS: pagination preserves existing card positions");
  await page.keyboard.press("/");
  assert.equal(
    await page
      .locator("#repository-search")
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page
    .getByRole("button", {
      name: "View test-owner/test-repository-0",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.match(page.url(), /repo=/);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator("article").count(), 12);
  console.log("PASS: accessible detail drawer closes without discarding feed");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  assert.equal(
    await page
      .locator("html")
      .evaluate((element) => element.classList.contains("dark")),
    true,
  );
  await page.screenshot({ path: "output/playwright/dark.png" });
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in with GitHub", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.match(
    await page.getByRole("dialog").innerText(),
    /never in our database/,
  );
  await page.keyboard.press("Escape");
  console.log("PASS: themes and PAT privacy disclosure");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Python", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "TypeScript", exact: true })
    .click();
  await page.keyboard.press("Escape");
  assert.equal(
    new URL(page.url()).searchParams.get("language"),
    "Python,TypeScript",
  );
  await page.getByRole("button", { name: "Category", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "AI / LLM", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "Developer Tools", exact: true })
    .click();
  await page.keyboard.press("Escape");
  assert.equal(new URL(page.url()).searchParams.get("category"), "ai,tools");
  await page
    .getByRole("button", { name: "Advanced filters", exact: true })
    .click();
  await page.getByRole("spinbutton").fill("1234");
  assert.equal(new URL(page.url()).searchParams.get("minStars"), "0");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Advanced filters", exact: true })
    .click();
  assert.equal(await page.getByRole("spinbutton").inputValue(), "0");
  await page.getByRole("spinbutton").fill("1234");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get("minStars") === "1234",
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  console.log(
    "PASS: language/category multi-select, draft cancellation and explicit filter application",
  );
  for (const query of ["no-results", "network-failure"]) {
    await page
      .getByRole("textbox", { name: "Search repositories", exact: true })
      .fill(query);
    await page
      .getByRole("textbox", { name: "Search repositories", exact: true })
      .press("Enter");
    await page
      .getByRole("heading", {
        name:
          query === "no-results"
            ? "No repositories found"
            : "Couldn’t load repositories",
        exact: true,
      })
      .waitFor();
  }
  await page
    .getByRole("button", { name: "Interface language", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "简体中文", exact: true }).click();
  await page
    .getByRole("heading", { name: "发现开源项目", exact: true })
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  assert.deepEqual(failures, []);
  console.log(
    "PASS: empty/error states, locale switching, no browser runtime errors",
  );
  await page.evaluate(() => localStorage.removeItem("discover_seen:anonymous"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(baseURL);
  await page.locator("article").first().waitFor();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("discover_seen:anonymous") ?? "[]")
        .length > 0,
  );
  const observed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("discover_seen:anonymous") ?? "[]"),
  );
  const beforeCount = await page.locator("article").count();
  assert.ok(beforeCount > 0, "exposure must not remove current cards");
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.waitForFunction(
    (ids) =>
      ![...document.querySelectorAll("[data-repository-id]")].some((e) =>
        ids.includes(Number(e.dataset.repositoryId)),
      ),
    observed,
  );
  await page.locator("article").first().waitFor();
  const freshIds = await page
    .locator("[data-repository-id]")
    .evaluateAll((cards) => cards.map((e) => Number(e.dataset.repositoryId)));
  assert.equal(
    freshIds.some((id) => observed.includes(id)),
    false,
  );
  // Search deliberately bypasses the recommendation exclusion list.
  await page
    .getByRole("textbox", { name: "搜索仓库", exact: true })
    .fill("explicit-search");
  await page
    .getByRole("textbox", { name: "搜索仓库", exact: true })
    .press("Enter");
  await page.locator('[data-repository-id="1"]').waitFor();
  assert.deepEqual(failures, []);
  console.log(
    "PASS: timed exposure persists without removing cards; refresh excludes seen, explicit search does not",
  );
} finally {
  await context.close();
  await browser.close();
}
