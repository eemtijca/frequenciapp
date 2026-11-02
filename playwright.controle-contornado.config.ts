import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visuais",
  testMatch: /\/controle-contornado\.spec\.ts$/,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3198" },
  webServer: {
    command:
      "node $(node -p \"require.resolve('vitest/package.json').replace('/vitest/package.json','/vite/bin/vite.js')\") --config tests/fixtures/controle-contornado/vite.config.ts",
    url: "http://localhost:3198/tests/fixtures/controle-contornado/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
