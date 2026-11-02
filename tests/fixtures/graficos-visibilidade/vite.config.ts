import { resolve } from "node:path";

const config = {
  cacheDir: resolve(process.cwd(), "test-results/.vite-graficos-visibilidade"),
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  esbuild: { jsx: "automatic" },
  define: { "process.env": {} },
  server: { host: "localhost", port: 3195, strictPort: true },
};

export default config;
