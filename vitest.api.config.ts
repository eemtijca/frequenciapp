// Vitest dos contratos de API contra o aplicativo no ar (APP_URL), com banco
// migrado e contas de teste (ver tests/README.md).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/api/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(raiz, "src"),
    },
  },
});
