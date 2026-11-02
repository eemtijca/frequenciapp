// Servidor Vite compartilhado pelos testes de componente, sem banco ou aplicativo.
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import tailwind from "@tailwindcss/postcss";

const requireVitest = createRequire(import.meta.url);
const caminhoVite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminhoVite).href);

export interface ServidorFixture {
  url: string;
  fechar: () => Promise<void>;
}

/** Sobe a fixture informada e devolve a URL pronta para o navegador. */
export async function criarServidorFixture(
  arquivoHtml: string,
  plugins: unknown[] = [],
): Promise<ServidorFixture> {
  const cache = await mkdtemp(path.join(tmpdir(), "frequenciapp-fixture-"));
  const servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    plugins,
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string")
    throw new Error("Servidor de fixture indisponível");
  const url = `http://127.0.0.1:${endereco.port}/${arquivoHtml.replaceAll("\\", "/")}`;
  return {
    url,
    fechar: async () => {
      await servidor.close();
      await rm(cache, { recursive: true, force: true });
    },
  };
}
