/**
 * The document shell and the static assets a deployment must keep serving.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, settle } from "./support/harness";

const publicDir = path.resolve(__dirname, "../public");

test.describe("document shell", () => {
  test("index.html: lang, viewport, theme colour, root element, noscript", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
    // (the CRA build minifies the whitespace after the comma; compare without whitespace)
    expect(
      await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content")?.replace(/\s+/g, ""))
    ).toBe("width=device-width,initial-scale=1");
    expect(await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content"))).toBe("#000000");
    expect(await page.evaluate(() => document.querySelector('meta[charset]')?.getAttribute("charset")?.toLowerCase())).toBe("utf-8");
    await expect(page.locator("#root")).toHaveCount(1);
    expect(await page.evaluate(() => document.querySelector("noscript")?.textContent)).toContain("You need to enable JavaScript to run this app.");
    // no favicon link is declared (the browser falls back to /favicon.ico)
    expect(await page.evaluate(() => document.querySelectorAll('link[rel~="icon"]').length)).toBe(0);
    await expect(page).toHaveTitle("Conductor UI");
  });

  test("production build: no React Query devtools toggle and no service worker", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page.locator('button[aria-label*="query devtools" i]')).toHaveCount(0);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  });

  test("the app bar logo comes from an absolute external URL (answered locally by the harness)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header img[alt=Conductor]")).toHaveAttribute("src", "https://assets.conductor-oss.org/logo.png");
  });
});

test.describe("public/ assets are served from the site root", () => {
  for (const [url, file, type] of [
    ["/logo.svg", "logo.svg", /image\/svg\+xml/],
    ["/favicon.svg", "favicon.svg", /image\/svg\+xml/],
    ["/diagramDotBg.svg", "diagramDotBg.svg", /image\/svg\+xml/],
    ["/robots.txt", "robots.txt", /text\/plain/],
  ] as const) {
    test(url, async ({ page }) => {
      const res = await page.request.get(url);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(type);
      expect((await res.body()).equals(fs.readFileSync(path.join(publicDir, file)))).toBe(true);
    });
  }

  test("the diagram canvas background points at /diagramDotBg.svg (absolute path, ignores any base path)", async ({ page }) => {
    await page.goto("/workflowDef/19test009");
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(/\w/);
    const bg = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .map((e) => getComputedStyle(e).backgroundImage)
        .find((b) => b.includes("diagramDotBg"))
    );
    expect(bg).toBe(`url("http://127.0.0.1:${new URL(page.url()).port}/diagramDotBg.svg")`);
  });
});
