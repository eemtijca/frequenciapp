import { resolve } from "node:path";
import { removerReturnDaCopia } from "./controle-negativo";

const provider = resolve("src/components/atualizacao/contexto-atualizacao.tsx");

const config = {
  cacheDir: resolve("test-results/.vite-atualizacao-offline"),
  resolve: { alias: { "@": resolve("src") } },
  esbuild: { jsx: "automatic" },
  define: { "process.env": {} },
  server: { host: "127.0.0.1", port: 3196, strictPort: true },
  plugins: [
    {
      name: "controle-negativo-offline-em-memoria",
      enforce: "pre",
      transform(code: string, id: string) {
        if (process.env.OFFLINE_CAUSAL_SEM_RETURN !== "1" || id.split("?")[0] !== provider) return;
        // Altera apenas a cópia transitória servida pelo Vite, nunca o arquivo do produto.
        return removerReturnDaCopia(code);
      },
    },
  ],
};

export default config;
