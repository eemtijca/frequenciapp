// Grade no navegador: proporção, detalhe e PDF protegido da turma de origem.
import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import type { Horario, Turma } from "@/domain/frequencia";
import type { RetratoGrade } from "@/domain/relatorio-grade";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { diaCorrente, diaDeChamada } from "../helpers/dia";
import { aguardarHidratacao, selecionarRelatorio } from "../helpers/pagina";

const SENHA = "E2E frase exclusiva de exportação 2026!";
test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

test("detalha a proporção e baixa o PDF protegido da turma de origem", async ({ page }) => {
  const dia = diaDeChamada();
  const hoje = diaCorrente();
  const turmas = await page.request.get("/api/turmas");
  expect(turmas.ok()).toBe(true);
  const lista = (await turmas.json()) as { turmas: Turma[] };
  const turma = lista.turmas.find((item) => item.rotulo === "E2E Ano A");
  if (!turma) throw new Error("Turma da massa não encontrada.");
  const aulas = [...turma.horarios].sort((a, b) => a.ordem - b.ordem);
  expect(aulas.length).toBeGreaterThanOrEqual(3);
  const alunos = await page.request.get("/api/alunos");
  expect(alunos.ok()).toBe(true);
  const pessoas = (await alunos.json()) as { alunos: { id: string; nome: string }[] };
  const aluno = pessoas.alunos.find((item) => item.nome === "E2E Aluno Um");
  if (!aluno) throw new Error("Aluno da massa não encontrado.");
  const salva = await page.request.post("/api/frequencias", {
    data: {
      dia,
      turmaId: turma.id,
      revisao: 0,
      faltas: [{ alunoId: aluno.id, horarios: aulas.slice(0, 2).map((aula: Horario) => aula.id) }],
      confirmarHistorico: true,
    },
  });
  expect(salva.ok()).toBe(true);

  const pedidos: string[] = [];
  const retratos: RetratoGrade["retrato"][] = [];
  page.on("request", (pedido) => pedidos.push(pedido.url() + (pedido.postData() ?? "")));
  page.on("response", async (resposta) => {
    if (new URL(resposta.url()).pathname !== "/api/relatorios/grade/retrato") return;
    if (resposta.status() !== 200) return;
    const corpo = (await resposta.json()) as RetratoGrade;
    retratos.push(corpo.retrato);
  });

  await page.goto("/");
  await aguardarHidratacao(page);
  await selecionarRelatorio(page, "Grade");
  const grade = page.locator('section[aria-label="Grade de frequência"]');
  const seletor = grade.getByRole("combobox", { name: "Turma de origem da grade" });
  if (await seletor.isVisible().catch(() => false)) {
    await seletor.click();
    await page.getByRole("option", { name: /E2E Ano A/ }).click();
  } else {
    const botaoTurma = grade.getByRole("button", { name: /E2E Ano A/ });
    await botaoTurma.scrollIntoViewIfNeeded();
    await botaoTurma.click();
  }
  const historico = grade.getByRole("columnheader", { name: "Histórico", exact: true });
  await historico.scrollIntoViewIfNeeded();
  await expect(
    grade.getByRole("columnheader", { name: "Dias com falta sem justificativa no período" }),
  ).toBeVisible();
  await expect(historico).toBeVisible();
  const linha = grade.getByRole("row", { name: /E2E Aluno Um/ });
  const parcial = linha.getByText("2/3", { exact: true });
  await parcial.scrollIntoViewIfNeeded();
  await expect(parcial).toBeVisible();
  await expect(
    grade.getByRole("img", {
      name: new RegExp(`E2E Aluno Um presente em parte das aulas em ${dia}, 2 de 3 aulas`),
    }),
  ).toBeVisible();
  await grade.getByRole("button", { name: "Ver faltas de E2E Aluno Um no período" }).click();
  const detalhe = grade.locator(`#detalhe-grade-${aluno.id}`);
  await expect(detalhe).toContainText("Sem justificativa");
  await expect(detalhe).toContainText("1ª aula");

  await grade.getByRole("button", { name: "Emitir relatório em PDF da turma de origem" }).click();
  const dialogo = page.getByRole("dialog", { name: "Preparar download" });
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
  await dialogo.getByLabel("Confirmar senha do ZIP").fill(SENHA);
  const download = await baixar(page, dialogo);
  const arquivo = await extrair(download, SENHA);
  expect(arquivo.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  await expect.poll(() => retratos.length).toBeGreaterThan(0);
  const retrato = retratos[0];
  if (!retrato) throw new Error("Retrato do PDF não foi recebido.");

  const parametros = pedidos
    .map((pedido) => new URL(pedido.split(" ")[0] ?? pedido))
    .find((url) => url.pathname === "/api/relatorios/grade/retrato")?.searchParams;
  if (!parametros) throw new Error("Pedido do retrato não foi recebido.");
  expect(parametros.get("de")).toBe(`${hoje.slice(0, 7)}-01`);
  expect(parametros.get("ate")).toBe(hoje);

  const texto = arquivo.toString("latin1");
  expect(texto).toContain("E2E Aluno Um");
  expect(texto).toContain("2 de 3");
  expect(texto).toContain("Presença parcial");
  expect(texto).toContain(retrato.hash);
  expect(texto).toContain(retrato.emTexto);
  expect(pedidos.join("\n")).toContain('"tipo":"relatorio"');
  expect(pedidos.join("\n")).toContain(`"retrato":"${retrato.hash}"`);
  expect(pedidos.join("\n")).not.toContain(SENHA);
  const persistido = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  expect(persistido).not.toContain(SENHA);
});

async function baixar(page: Page, dialogo: ReturnType<Page["getByRole"]>) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click(),
  ]);
  return download;
}

async function extrair(download: Download, senha: string) {
  const bytes = await readFile((await download.path()) ?? "");
  const leitor = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const entradas = await leitor.getEntries();
    expect(entradas).toHaveLength(1);
    const entrada = entradas[0];
    if (!entrada || entrada.directory) throw new Error("Arquivo ausente no ZIP.");
    expect(entrada.filename).toBe("relatorio.pdf");
    expect(entrada.extraFieldAES?.strength).toBe(3);
    expect(bytes.includes(Buffer.from("E2E Aluno Um"))).toBe(false);
    return Buffer.from(await entrada.arrayBuffer({ password: senha, checkSignature: true }));
  } finally {
    await leitor.close();
  }
}
