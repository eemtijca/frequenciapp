// Apenas fixture local; não inicia Next.js, aplicação, banco ou globalSetup do E2E.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visuais",
  testMatch: /\/foco-forcado\.spec\.ts$/,
  outputDir: "test-results/foco-forcado",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3197" },
  webServer: {
    command: "pnpm exec vite --config tests/fixtures/foco-forcado/vite.config.ts",
    url: "http://127.0.0.1:3197/tests/fixtures/foco-forcado/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
