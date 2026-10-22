import { defineConfig, devices } from "@playwright/test";

/**
 * Characterization suite: pins the behaviour of the legacy Conductor UI (CRA 5 / React Router 5)
 * so the migrated app can be judged by tests it may not edit.
 *
 * - Runs against a PRODUCTION BUILD served statically with SPA fallback
 *   (characterization/support/server.mjs). The build directory defaults to `build`
 *   (CRA); a Vite build must be pointed at explicitly:  CHAR_BUILD_DIR=dist yarn test:char
 *   Delete stale build output of the old toolchain first, or the old app is tested by mistake.
 * - No real backend, no real internet: see characterization/support/harness.ts.
 * - Screenshots: Windows 11, Chromium headless shell 148 (Playwright 1.60), 1440x900, UTC, en-US.
 *   Thresholds are documented in case/routes.md.
 */
const PORT = Number(process.env.CHAR_PORT || 5071);

export default defineConfig({
  testDir: "./characterization",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/characterization",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",

  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 4,
  timeout: 45_000,

  reporter: [["list"], ["json", { outputFile: "test-results/characterization.json" }]],

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Strictest values that three consecutive runs on the old build allow; see case/routes.md.
      maxDiffPixelRatio: 0,
      threshold: 0.005,
    },
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],

  webServer: {
    command: "node characterization/support/server.mjs",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { CHAR_PORT: String(PORT), CHAR_BUILD_DIR: process.env.CHAR_BUILD_DIR || "build" },
  },
});
