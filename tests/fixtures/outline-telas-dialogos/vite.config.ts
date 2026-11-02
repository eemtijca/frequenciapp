import { resolve } from "node:path";

const config = {
  cacheDir: resolve(process.cwd(), "node_modules/.vite-outline-telas-dialogos"),
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  esbuild: { jsx: "automatic" },
  define: { "process.env": {} },
  server: { host: "localhost", port: 3196, strictPort: true },
};

export default config;
