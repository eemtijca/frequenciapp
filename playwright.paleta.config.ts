// Suíte visual isolada: sem sessão, sem globalSetup e sem banco real.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ponta-a-ponta/interface",
  testMatch: "paleta-neutra.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3197", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec next dev -p 3197",
    url: "http://localhost:3197",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
      DIRECT_URL: "postgresql://test:test@127.0.0.1:1/test",
      AUTH_SECRET: "segredo-dummy-de-32-bytes-para-testes-00",
    },
  },
});
