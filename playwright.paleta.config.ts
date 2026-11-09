// Suíte visual sem sessão, contra o runtime descartável comprovado.
import { defineConfig, devices } from "@playwright/test";
import { exigirIsolamento } from "./tests/helpers/isolamento.mjs";
const baseURL = exigirIsolamento().appUrl;

export default defineConfig({
  globalSetup: "./tests/isolamento/setup-playwright.ts",
  testDir: "./tests/ponta-a-ponta/interface",
  testMatch: "paleta-neutra.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, ...devices["Desktop Chrome"] },
  webServer: undefined,
});
