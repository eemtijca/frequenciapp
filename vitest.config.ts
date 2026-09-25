// Configuração do Vitest: suíte de unidade (sem banco, sem rede).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(raiz, "src"),
    },
  },
});
