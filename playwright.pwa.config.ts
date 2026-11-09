// Playwright do PWA: roda contra o build de produção, onde o service worker
// é o real. O app já no ar usa PLAYWRIGHT_SKIP_WEBSERVER=1.
import { defineConfig, devices } from "@playwright/test";
import { exigirIsolamento } from "./tests/helpers/isolamento.mjs";

const baseURL = exigirIsolamento().appUrl;

export default defineConfig({
  globalSetup: "./tests/isolamento/setup-playwright.ts",
  testDir: "./tests/ponta-a-ponta",
  // Restrinja ao nome do arquivo: o caminho do worktree pode conter "pwa".
  testMatch: /(?:^|[\\/])pwa[^\\/]*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: undefined,
});
