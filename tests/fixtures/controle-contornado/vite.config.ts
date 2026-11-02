import { resolve } from "node:path";

const config = {
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  esbuild: { jsx: "automatic" },
  server: { host: "localhost", port: 3198, strictPort: true },
};

export default config;
