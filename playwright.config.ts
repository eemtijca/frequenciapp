// Playwright headless: execução serial (um Postgres e uma massa compartilhada),
// servidor condicional e projetos de desktop e celular.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // O PWA roda em configuração própria contra o build de produção.
  testIgnore: /pwa.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    storageState: "tests/e2e/.auth/admin.json",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            DATABASE_URL:
              process.env.DATABASE_URL ??
              "postgresql://frequencia:frequencia@localhost:5432/frequencia",
            DIRECT_URL:
              process.env.DIRECT_URL ??
              "postgresql://frequencia:frequencia@localhost:5432/frequencia",
            AUTH_SECRET: process.env.AUTH_SECRET ?? "segredo-dummy-de-32-bytes-para-testes-00",
            TZ_APP: process.env.TZ_APP ?? "America/Fortaleza",
          },
        },
});
