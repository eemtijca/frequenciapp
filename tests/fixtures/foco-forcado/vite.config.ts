import { resolve } from "node:path";

const config = {
  cacheDir: resolve(process.cwd(), "test-results/.vite-foco-forcado"),
  envDir: resolve(process.cwd(), "tests/fixtures/foco-forcado"),
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  esbuild: { jsx: "automatic" },
  define: { "process.env": {} },
  server: { host: "127.0.0.1", port: 3197, strictPort: true, hmr: false },
};

export default config;
