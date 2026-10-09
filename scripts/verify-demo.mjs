import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
const apiRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());
});
try {
  await page.goto(process.env.DEMO_TEST_URL ?? "http://localhost:4173");
  await page.locator("article").first().waitFor();
  assert.match(await page.locator("body").innerText(), /Sample data/);
  const metric = await page
    .locator('[class*="metric-"]')
    .first()
    .evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      parentBackground: getComputedStyle(e.parentElement).backgroundColor,
      padding: getComputedStyle(e.parentElement).padding,
    }));
  assert.equal(metric.background, "rgba(0, 0, 0, 0)");
  assert.equal(metric.parentBackground, "rgba(0, 0, 0, 0)");
  assert.equal(metric.padding, "0px");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("dark"),
  );
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Python", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "TypeScript", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.locator("article").first().waitFor();
  await page.locator("article h2 button").first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, [], "Demo API must stay entirely local");
  console.log(
    "PASS: standalone demo renders shared UI, direct theme switch, multi-select, details and mobile; zero API traffic",
  );
} finally {
  await browser.close();
}
