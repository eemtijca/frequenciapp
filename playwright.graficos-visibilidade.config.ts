import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visuais",
  testMatch: /\/graficos-visibilidade\.spec\.ts$/,
  outputDir: "test-results/graficos-visibilidade",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3195" },
  webServer: {
    command:
      "node $(node -p \"require.resolve('vitest/package.json').replace('/vitest/package.json','/vite/bin/vite.js')\") --config tests/fixtures/graficos-visibilidade/vite.config.ts",
    url: "http://localhost:3195/tests/fixtures/graficos-visibilidade/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
