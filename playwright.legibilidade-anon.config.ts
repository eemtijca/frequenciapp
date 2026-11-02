// Somente login anônimo, sem globalSetup, conta de teste ou webServer.
// O servidor e o banco descartáveis são preparados externamente.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
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
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
});
