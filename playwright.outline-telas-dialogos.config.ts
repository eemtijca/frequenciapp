import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visuais",
  testMatch: /\/outline-telas-dialogos\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/outline-telas-dialogos-verificacao",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3196" },
  webServer: {
    command:
      "node $(node -p \"require.resolve('vitest/package.json').replace('/vitest/package.json','/vite/bin/vite.js')\") --config tests/fixtures/outline-telas-dialogos/vite.config.ts",
    url: "http://localhost:3196/tests/fixtures/outline-telas-dialogos/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
