import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visuais",
  testMatch: /\/atualizacao-offline\.spec\.ts$/,
  outputDir: "test-results/atualizacao-offline",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3196",
    serviceWorkers: "block",
  },
  webServer: {
    command:
      "node $(node -p \"require.resolve('vitest/package.json').replace('/vitest/package.json','/vite/bin/vite.js')\") --config tests/fixtures/atualizacao-offline/vite.config.ts",
    url: "http://127.0.0.1:3196/tests/fixtures/atualizacao-offline/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
