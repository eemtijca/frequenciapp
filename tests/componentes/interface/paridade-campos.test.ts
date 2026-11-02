// Compara o CSS computado dos componentes de produção com o commit anterior.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
const repositorio = process.cwd();
let diretorio: string;
let browser: Browser;
const servidores: Awaited<ReturnType<typeof createServer>>[] = [];
const urls: string[] = [];

beforeAll(async () => {
  diretorio = await mkdtemp(path.join(tmpdir(), "campos-baseline-"));
  const arquivo = path.join(diretorio, "baseline.tar");
  const referencia = process.env.BASELINE_REF ?? "origin/main";
  let ref = referencia;
  try {
    execFileSync("git", ["rev-parse", "--verify", `${referencia}^{commit}`], {
      cwd: repositorio,
      stdio: "ignore",
    });
  } catch {
    ref = "HEAD^";
  }
  execFileSync("git", ["archive", "--format=tar", `--output=${arquivo}`, ref], {
    cwd: repositorio,
  });
  execFileSync("tar", ["-xf", arquivo, "-C", diretorio]);
  await symlink(
    path.join(repositorio, "node_modules"),
    path.join(diretorio, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  for (const nome of ["paridade-campos.html", "paridade-campos.tsx"]) {
    await cp(
      path.join(repositorio, "tests/componentes/interface", nome),
      path.join(diretorio, "tests/componentes/interface", nome),
    );
  }
  for (const raiz of [diretorio, repositorio]) {
    const servidor = await createServer({
      root: raiz,
      configFile: false,
      cacheDir: path.join(diretorio, raiz === repositorio ? "cache-atual" : "cache-baseline"),
      define: { "process.env": "{}" },
      css: { postcss: { plugins: [tailwind()] } },
      esbuild: { jsx: "automatic" },
      resolve: { alias: { "@": path.join(raiz, "src") } },
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
    });
    servidores.push(servidor);
    await servidor.listen();
    const endereco = servidor.httpServer?.address();
    if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
    urls.push(`http://127.0.0.1:${endereco.port}/tests/componentes/interface/paridade-campos.html`);
  }
  browser = await chromium.launch({ headless: true });
}, 120000);

afterAll(async () => {
  await browser?.close();
  for (const servidor of servidores) await servidor.close();
  if (diretorio) await rm(diretorio, { recursive: true, force: true });
});

async function coletar(page: Page, tema: "claro" | "escuro") {
  await page.evaluate(
    (escuro) => document.documentElement.classList.toggle("dark", escuro),
    tema === "escuro",
  );
  await page.mouse.move(0, 0);
  const resultado: Record<string, Record<string, string | boolean>> = {};
  for (const superficie of ["pagina", "cartao"]) {
    for (const nome of ["Texto", "Seletor", "Buscável", "Busca"]) {
      for (const estado of ["repouso", "foco", "desabilitado"]) {
        const alvo = page.getByLabel(
          `${nome} ${superficie} ${estado === "desabilitado" ? "desabilitado" : "habilitado"}`,
        );
        if (estado === "foco") {
          await alvo.focus();
          expect(
            await alvo.evaluate((el) => el.matches(":focus-visible")),
            `${nome}: foco visível`,
          ).toBe(true);
        } else {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          if (estado === "desabilitado")
            expect(await alvo.isDisabled(), `${nome}: desabilitado`).toBe(true);
        }
        await page.waitForTimeout(200);
        resultado[`${superficie}/${nome}/${estado}`] = await alvo.evaluate((el) => {
          const propriedades = [
            "backgroundColor",
            "color",
            "borderTopColor",
            "borderTopWidth",
            "borderTopStyle",
            "borderRadius",
            "outlineColor",
            "outlineWidth",
            "outlineStyle",
            "outlineOffset",
            "boxShadow",
            "opacity",
            "cursor",
          ] as const;
          const estilos = (elemento: Element, prefixo: string) => {
            const css = getComputedStyle(elemento);
            return Object.fromEntries(propriedades.map((p) => [prefixo + p, css[p]]));
          };
          return {
            ...estilos(el, "campo."),
            ...(el.getAttribute("type") === "search" && el.parentElement
              ? estilos(el.parentElement, "moldura.")
              : {}),
          };
        });
      }
    }
  }
  return resultado;
}

async function abrirPaginas() {
  const paginas: Page[] = [];
  try {
    // Evita concorrer a primeira otimização de dependências de ambos os servidores.
    for (const url of urls) {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      paginas.push(page);
      await page.goto(url, { timeout: 120000 });
    }
    return paginas;
  } catch (erro) {
    await Promise.all(paginas.map((p) => p.close()));
    throw erro;
  }
}

it("preserva no escuro os estilos computados da referência de base", async () => {
  const paginas = await abrirPaginas();
  try {
    const [baseline, atual] = await Promise.all(paginas.map((p) => coletar(p, "escuro")));
    if (!baseline || !atual) throw new Error("Resultados do diferencial ausentes");
    for (const chave of Object.keys(baseline))
      expect.soft(atual[chave], chave).toEqual(baseline[chave]);
  } finally {
    await Promise.all(paginas.map((p) => p.close()));
  }
}, 120000);

it("o diferencial também exercita o tema claro e detecta os novos contornos", async () => {
  const paginas = await abrirPaginas();
  try {
    const [baseline, atual] = await Promise.all(paginas.map((p) => coletar(p, "claro")));
    if (!baseline || !atual) throw new Error("Resultados do diferencial ausentes");
    for (const nome of ["Texto", "Seletor", "Buscável", "Busca"]) {
      const chave = `pagina/${nome}/repouso`;
      const propriedade = nome === "Busca" ? "moldura.borderTopColor" : "campo.borderTopColor";
      const original = baseline[chave];
      const modificado = atual[chave];
      if (!original || !modificado) throw new Error(`Campo ausente: ${chave}`);
      expect(modificado[propriedade], chave).not.toBe(original[propriedade]);
    }
  } finally {
    await Promise.all(paginas.map((p) => p.close()));
  }
}, 120000);
