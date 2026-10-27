// Configura testes de componentes em navegador, independentes do aplicativo e do banco.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/componentes/**/*.test.ts"],
    // Os servidores de fixture compartilham o cache de otimização do Vite.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
