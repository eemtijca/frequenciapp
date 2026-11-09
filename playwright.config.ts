// Playwright headless: execução serial (um Postgres e uma massa compartilhada),
// runtime comprovado e projetos de desktop e celular.
import { defineConfig, devices } from "@playwright/test";
import { exigirIsolamento } from "./tests/helpers/isolamento.mjs";

const baseURL = exigirIsolamento().appUrl;

export default defineConfig({
  testDir: "./tests/ponta-a-ponta",
  // O PWA roda em configuração própria contra o build de produção.
  // Confira apenas o nome do arquivo, não os diretórios do caminho.
  testIgnore: /(?:^|[\\/])pwa[^\\/]*\.spec\.ts$/,
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
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  // O executor inicia e atesta o servidor. Nunca reutiliza um servidor externo.
  webServer: undefined,
});
