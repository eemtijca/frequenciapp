// Testa a visão real no navegador, com API simulada e sem banco da aplicação.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminhoVite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminhoVite).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let navegador: Browser;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    define: { "process.env": "{}" },
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/envio-parcial.html`;
  navegador = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
});
async function pagina(): Promise<Page> {
  const p = await navegador.newPage({ viewport: { width: 390, height: 800 } });
  await p.route("**/api/planilha-parcial/estado", (r) =>
    r.fulfill({ json: { podeEnviar: true, planilhaNome: "Teste" } }),
  );
  await p.route("**/api/planilha-parcial/simular", (r) =>
    r.fulfill({
      json: {
        novas: 1,
        atualizacoes: 0,
        existentes: 0,
        criar: [{ linha: 1, nome: "Aluno sigiloso", celulas: [] }],
        atualizar: [],
        avisos: [],
        bloqueado: false,
        planoHash: "teste",
      },
    }),
  );
  await p.goto(url, { timeout: 90000 });
  return p;
}
async function montado(p: Page) {
  return p.evaluate(() => {
    // A ausência do portal não prova que a instância React foi descartada.
    type Fibra = { type: unknown; child: Fibra | null; sibling: Fibra | null };
    const root = (window as unknown as { raizTeste: { _internalRoot: { current: Fibra } } })
      .raizTeste;
    const pilha: (Fibra | null)[] = [root._internalRoot.current];
    while (pilha.length) {
      const f = pilha.pop();
      if (!f) continue;
      if (typeof f.type === "function" && f.type.name === "DialogoEnviarParciais") return true;
      pilha.push(f.child, f.sibling);
    }
    return false;
  });
}
it("descarta a instância e a prévia ao fechar e reinicia os filtros", async () => {
  const p = await pagina();
  try {
    const gatilho = p.getByRole("button", { name: "Enviar para a planilha" });
    await gatilho.click();
    await p.getByRole("switch", { name: "Atualizar registros já enviados" }).click();
    await p.getByRole("button", { name: "Conferir envio" }).click();
    await p.getByText("Aluno sigiloso", { exact: true }).first().waitFor();
    expect(await montado(p)).toBe(true);
    await p.getByRole("button", { name: "Cancelar" }).click();
    await expect.poll(() => montado(p)).toBe(false);
    await gatilho.click();
    expect(await p.getByRole("button", { name: "Conferir envio" }).count()).toBe(1);
    expect(
      await p.getByRole("switch", { name: "Atualizar registros já enviados" }).isChecked(),
    ).toBe(false);
    expect(await p.getByText("Aluno sigiloso").count()).toBe(0);
  } finally {
    await p.close();
  }
});
it("ao desativar, mantém o envio em curso e o resultado incerto ao voltar", async () => {
  const p = await pagina();
  let liberar: () => void = () => {};
  const pendente = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let recebidos = 0;
  try {
    await p.route("**/api/planilha-parcial/enviar", async (r) => {
      recebidos++;
      await pendente;
      await r.fulfill({ status: 500, json: { error: "Falha no envio" } });
    });
    await p.getByRole("button", { name: "Enviar para a planilha" }).click();
    await p.getByRole("button", { name: "Conferir envio" }).click();
    await p.getByRole("button", { name: "Confirmar envio" }).click();
    await expect.poll(() => recebidos).toBe(1);
    expect(await p.getByRole("button", { name: "Cancelar" }).isDisabled()).toBe(true);
    await p.keyboard.press("Escape");
    expect(await p.getByRole("dialog").count()).toBe(1);
    const alternar = p.getByRole("button", { name: "Alternar visão", includeHidden: true });
    await alternar.evaluate((el: HTMLButtonElement) => el.click());
    await expect.poll(() => p.getByRole("dialog").count()).toBe(0);
    expect(await montado(p)).toBe(true);
    await alternar.evaluate((el: HTMLButtonElement) => el.click());
    await p.getByRole("dialog").waitFor();
    expect(await p.getByRole("button", { name: "Cancelar" }).isDisabled()).toBe(true);
    const resposta = p.waitForResponse((r) => r.url().endsWith("/api/planilha-parcial/enviar"));
    liberar();
    expect((await resposta).status()).toBe(500);
    await p.getByText("Confira o resultado na planilha e gere outra prévia.").waitFor();
    expect(await p.getByRole("button", { name: "Confirmar envio" }).count()).toBe(0);
    expect(recebidos).toBe(1);
  } finally {
    liberar();
    await p.close();
  }
});
