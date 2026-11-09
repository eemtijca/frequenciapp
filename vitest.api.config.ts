// Vitest dos contratos de API contra o aplicativo no ar (APP_URL), com banco
// migrado e contas de teste (ver tests/README.md).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { exigirIsolamento } from "./tests/helpers/isolamento.mjs";

exigirIsolamento();

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/isolamento/setup-api.ts"],
    include: ["tests/api/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Um banco compartilhado: arquivos em paralelo disputam transações
    // serializáveis e a massa de teste. A suíte roda em série.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(raiz, "src"),
    },
  },
});
