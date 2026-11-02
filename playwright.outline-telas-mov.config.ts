import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/visuais",
  testMatch: /\/outline-telas-mov\.spec\.ts$/,
  timeout: 30_000,
  retries: 0,
  workers: 2,
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3197" },
  webServer: {
    command: "pnpm exec vite --config tests/fixtures/outline-telas-mov/vite.config.ts",
    url: "http://localhost:3197/tests/fixtures/outline-telas-mov/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
