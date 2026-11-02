import { resolve } from "node:path";

const config = {
  resolve: {
    alias: [
      {
        find: "@/components/graficos/graficos-sob-demanda",
        replacement: resolve(process.cwd(), "tests/fixtures/outline-telas-mov/graficos.tsx"),
      },
      { find: "@", replacement: resolve(process.cwd(), "src") },
    ],
  },
  define: { "process.env": "{}" },
  esbuild: { jsx: "automatic" },
  server: { host: "localhost", port: 3197, strictPort: true },
};

export default config;
