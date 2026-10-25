// Playwright headless: execução serial (um Postgres e uma massa compartilhada),
// servidor condicional e projetos de desktop e celular.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
// No Docker Desktop do Windows, o aplicativo publicado fica em
// host.docker.internal. O Chromium resolve localhost para esse host, o que
// preserva a origem segura exigida por crypto.subtle no FrequenciBI.
const resolverLocalhost = process.env.PLAYWRIGHT_RESOLVER_LOCALHOST === "1";

export default defineConfig({
  testDir: "./tests/ponta-a-ponta",
  // O PWA roda em configuração própria contra o build de produção.
  testIgnore: /pwa.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: "./tests/ponta-a-ponta/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    storageState: "tests/ponta-a-ponta/.auth/admin.json",
    launchOptions: resolverLocalhost
      ? { args: ["--host-resolver-rules=MAP localhost host.docker.internal"] }
      : undefined,
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
          command: "pnpm run dev",
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
