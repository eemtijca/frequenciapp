// Somente login anônimo, sem preparar contas ou iniciar servidor.
// A guarda confirma o runtime descartável antes das requisições.
import { defineConfig, devices } from "@playwright/test";
import { exigirIsolamento } from "./tests/helpers/isolamento.mjs";
const baseURL = exigirIsolamento().appUrl;

export default defineConfig({
  globalSetup: "./tests/isolamento/setup-playwright.ts",
  testDir: "./tests/ponta-a-ponta",
  testMatch: /(?:^|[\\/])legibilidade-real\.spec\.ts$/,
  grep: /@anon/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
});
