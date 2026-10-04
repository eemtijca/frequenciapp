// Exportações protegidas nos três pontos do app, com senha local,
// cancelamento, extração real e ausência de download em caso de falha.
import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { ADMIN_E2E, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const SENHA = "E2E frase exclusiva de exportação 2026!";
test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

async function abrirDownload(
  page: Page,
  tipo: "grade" | "relacao" | "copia",
  perfilImagem?: string,
) {
  await page.goto("/");
  await aguardarHidratacao(page);
  if (tipo === "grade") {
    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Grade" }).click();
    const grade = page.locator('section[aria-label="Grade de frequência"]');
    const turma = grade.getByRole("button", { name: /E2E Ano A/ });
    if (await turma.isVisible().catch(() => false)) await turma.click();
    if (perfilImagem) {
      await expect(grade.getByRole("button", { name: "Baixar planilha (CSV)" })).toBeEnabled();
      await mkdir("docs/imagens", { recursive: true });
      // A captura deve mostrar a visão depois da transição, sem interrompê-la.
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `docs/imagens/download-antes-${perfilImagem}.png`,
      });
    }
    await grade.getByRole("button", { name: "Baixar planilha (CSV)" }).click();
  } else {
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: tipo === "relacao" ? "Alunos" : "Configurações" }).click();
    if (tipo === "copia") {
      await page
        .getByRole("navigation", { name: "Categorias de configurações" })
        .getByRole("button", { name: "Dados", exact: true })
        .click();
      const secao = page.locator('[data-secao="config-copia"]');
      await secao.getByRole("button", { name: "Cópia de segurança" }).click();
      await secao.getByRole("button", { name: "Baixar cópia" }).click();
    } else {
      await page.getByRole("button", { name: "Exportar relação" }).click();
    }
  }
  return page.getByRole("dialog", { name: "Preparar download" });
}

async function extrair(download: Download, nome: string) {
  const bytes = await readFile((await download.path()) ?? "");
  const leitor = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const entradas = await leitor.getEntries();
    expect(entradas).toHaveLength(1);
    const entrada = entradas[0];
    if (!entrada || entrada.directory) throw new Error("Arquivo ausente no ZIP.");
    expect(entrada.filename).toBe(nome);
    expect(entrada.extraFieldAES?.strength).toBe(3);
    await expect(
      entrada.arrayBuffer({ password: "Senha errada 2026", checkSignature: true }),
    ).rejects.toThrow();
    const conteudo = Buffer.from(
      await entrada.arrayBuffer({ password: SENHA, checkSignature: true }),
    );
    expect(bytes.includes(Buffer.from("E2E Aluno Um"))).toBe(false);
    return conteudo;
  } finally {
    await leitor.close();
  }
}

for (const tipo of ["grade", "relacao", "copia"] as const) {
  test(`baixa ${tipo} com AES-256 e senha apenas no navegador`, async ({ page }, testInfo) => {
    const pedidos: string[] = [];
    page.on("request", (pedido) => pedidos.push(pedido.url() + (pedido.postData() ?? "")));
    const dialogo = await abrirDownload(
      page,
      tipo,
      tipo === "grade" ? testInfo.project.name : undefined,
    );
    await expect(dialogo.getByLabel("ZIP protegido por senha")).toBeChecked();
    await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
    await dialogo.getByLabel("Confirmar senha do ZIP").fill(SENHA);
    if (tipo === "copia")
      await dialogo.getByLabel("Senha atual do administrador").fill(ADMIN_E2E.senha);
    if (tipo === "grade") {
      await mkdir("docs/imagens", { recursive: true });
      await expect(dialogo).toHaveCSS("opacity", "1");
      await page.screenshot({
        path: `docs/imagens/download-protegido-${testInfo.project.name}.png`,
      });
    }
    const downloads: Download[] = [];
    page.on("download", (arquivo) => downloads.push(arquivo));
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialogo
        .getByRole("button", { name: "Baixar ZIP protegido" })
        .click({ clickCount: 2, delay: 30 }),
    ]);
    await expect(dialogo).toHaveCount(0);
    expect(downloads).toHaveLength(1);
    const nomes = { grade: "grade.csv", relacao: "relacao-alunos.csv", copia: "copia.json" };
    const externos = {
      grade: "frequenciapp-grade.zip",
      relacao: "frequenciapp-relacao-alunos.zip",
      copia: "frequenciapp-copia.zip",
    };
    expect(download.suggestedFilename()).toBe(externos[tipo]);
    const conteudo = await extrair(download, nomes[tipo]);
    if (tipo === "copia") {
      const dados = JSON.parse(conteudo.toString("utf8")) as { alunos: { nome: string }[] };
      expect(dados.alunos.some((aluno) => aluno.nome === "E2E Aluno Um")).toBe(true);
    } else {
      expect(conteudo.toString("utf8")).toContain("E2E Aluno Um");
      expect(conteudo.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    }
    expect(pedidos.join("\n")).not.toContain(SENHA);
    const persistido = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
    expect(persistido).not.toContain(SENHA);
    // A senha e a opção são reiniciadas em cada exportação.
    const proximo = await abrirDownload(page, tipo);
    await expect(proximo.getByLabel("Senha do ZIP", { exact: true })).toHaveValue("");
    await expect(proximo.getByLabel("ZIP protegido por senha")).toBeChecked();
  });
}

test("cancelar e senhas inválidas não solicitam a cópia nem geram download", async ({ page }) => {
  let consultas = 0;
  const downloads: Download[] = [];
  page.on("download", (arquivo) => downloads.push(arquivo));
  page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname === "/api/backup/exportar") consultas += 1;
  });
  const dialogo = await abrirDownload(page, "copia");
  await dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("senha atual do administrador");
  await dialogo.getByLabel("Senha atual do administrador").fill(ADMIN_E2E.senha);
  await dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("12 e 128");
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
  await dialogo.getByLabel("Confirmar senha do ZIP").fill(`${SENHA} errada`);
  await dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("confirmação");
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  expect(consultas).toBe(0);
  expect(downloads).toHaveLength(0);
  const novo = await abrirDownload(page, "copia");
  await expect(novo.getByLabel("Senha do ZIP", { exact: true })).toHaveValue("");
  await novo.getByRole("button", { name: "Cancelar" }).click();
});

test("falha na auditoria não baixa o CSV nem o ZIP e permite repetir", async ({ page }) => {
  const downloads: Download[] = [];
  page.on("download", (arquivo) => downloads.push(arquivo));
  const dialogo = await abrirDownload(page, "grade");
  await page.route("**/api/exportacoes/registro", (rota) =>
    rota.fulfill({
      status: 503,
      json: { error: "Não foi possível registrar a exportação." },
    }),
  );
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
  await dialogo.getByLabel("Confirmar senha do ZIP").fill(SENHA);
  await dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click();
  await expect(dialogo.getByRole("alert")).toContainText(
    "Não foi possível registrar a exportação.",
  );
  expect(downloads).toHaveLength(0);
  await page.unroute("**/api/exportacoes/registro");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("frequenciapp-grade.zip");
});

test("permite JSON original somente após escolher a opção sem senha", async ({ page }) => {
  const dialogo = await abrirDownload(page, "copia");
  await dialogo.getByLabel("Senha atual do administrador").fill(ADMIN_E2E.senha);
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
  await dialogo.getByLabel("Arquivo original sem senha").check();
  await expect(dialogo.getByText(/conteúdo ficará acessível/)).toBeVisible();
  await expect(dialogo.getByLabel("Senha do ZIP", { exact: true })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialogo.getByRole("button", { name: "Baixar arquivo original" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^frequenciapp-copia-.*\.json$/);
  const conteudo = await readFile((await download.path()) ?? "", "utf8");
  expect(JSON.parse(conteudo)).toHaveProperty("alunos");
});

test("falha na cópia não gera arquivo e permite tentar novamente", async ({ page }) => {
  const downloads: Download[] = [];
  page.on("download", (arquivo) => downloads.push(arquivo));
  const dialogo = await abrirDownload(page, "copia");
  await dialogo.getByLabel("Senha atual do administrador").fill(ADMIN_E2E.senha);
  await page.route("**/api/backup/exportar", (rota) =>
    rota.fulfill({
      status: 503,
      json: { error: "Não foi possível preparar a cópia." },
    }),
  );
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
  await dialogo.getByLabel("Confirmar senha do ZIP").fill(SENHA);
  await dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click();
  await expect(dialogo.getByRole("alert")).toContainText("Não foi possível preparar a cópia.");
  expect(downloads).toHaveLength(0);
  await page.unroute("**/api/backup/exportar");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("frequenciapp-copia.zip");
});
