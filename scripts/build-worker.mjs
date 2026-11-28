// Compila o processo worker em um único arquivo ESM para a imagem de execução.
import { build } from "esbuild";

await build({
  entryPoints: ["src/worker.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  tsconfig: "tsconfig.json",
  sourcemap: false,
  logLevel: "info",
  banner: {
    js: 'import { createRequire as __criarRequire } from "node:module"; const require = __criarRequire(import.meta.url);',
  },
});
