// Grade no navegador: proporção, detalhe e PDF protegido da turma de origem.
import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { diaLocal, ultimoDiaDeChamada, type Horario, type Turma } from "@/domain/frequencia";
import { textoDoPdf } from "@/domain/pdf-texto";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, selecionarRelatorio } from "../helpers/pagina";

const SENHA = "E2E frase exclusiva de exportação 2026!";
test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

test("detalha a proporção e baixa o PDF protegido da turma de origem", async ({ page }) => {
  const dia = ultimoDiaDeChamada(diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza"));
  const turmas = await page.request.get("/api/turmas");
  expect(turmas.ok()).toBe(true);
  const lista = (await turmas.json()) as { turmas: Turma[] };
  const turma = lista.turmas.find((item) => item.rotulo === "E2E Ano A");
  if (!turma) throw new Error("Turma da massa não encontrada.");
  const aulas = [...turma.horarios].sort((a, b) => a.ordem - b.ordem);
  expect(aulas.length).toBeGreaterThanOrEqual(2);
  const alunos = await page.request.get("/api/alunos");
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

  await page.goto("/?visao=grade");
  await aguardarHidratacao(page);
  await selecionarRelatorio(page, "Grade");
  const grade = page.locator('section[aria-label="Grade de frequência"]');
  const seletor = grade.getByRole("combobox", { name: "Turma de origem da grade" });
  if (await seletor.isVisible()) {
    await seletor.click();
    await page.getByRole("option", { name: /E2E Ano A/ }).click();
  } else {
    const botaoTurma = grade.getByRole("button", { name: /E2E Ano A/ });
    await botaoTurma.scrollIntoViewIfNeeded();
    await botaoTurma.click();
  }
  const historico = grade.getByRole("columnheader", { name: "Faltas de todo o histórico" });
  await historico.scrollIntoViewIfNeeded();
  await expect(grade.getByRole("columnheader", { name: "Faltas no período" })).toBeVisible();
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
  await grade.getByRole("button", { name: "Ver faltas de E2E Aluno Um" }).click();
  await expect(grade.locator(`#faltas-${aluno.id}`)).toContainText("Sem justificativa");
  await expect(grade.locator(`#faltas-${aluno.id}`)).toContainText("1ª aula");

  const respostas: { hash: string }[] = [];
  page.on("response", async (resposta) => {
    if (new URL(resposta.url()).pathname !== "/api/relatorios/grade" || resposta.status() !== 200)
      return;
    const corpo = (await resposta.json()) as { retrato: { hash: string } };
    respostas.push(corpo.retrato);
  });
  await grade.getByRole("button", { name: "Baixar relatório (PDF)" }).click();
  const dialogo = page.getByRole("dialog", { name: "Preparar download" });
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(SENHA);
  await dialogo.getByLabel("Confirmar senha do ZIP").fill(SENHA);
  const download = await baixar(page, dialogo);
  const arquivo = await extrair(download);
  expect(arquivo.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  await expect.poll(() => respostas.length).toBeGreaterThan(0);
  const retrato = respostas[0];
  if (!retrato) throw new Error("Retrato do PDF não foi recebido.");
  expect(textoDoPdf(arquivo)).toContain(retrato.hash);
  expect(JSON.stringify(respostas)).not.toContain(SENHA);
});

async function baixar(page: Page, dialogo: ReturnType<Page["getByRole"]>) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click(),
  ]);
  return download;
}

async function extrair(download: Download) {
  const bytes = await readFile((await download.path()) ?? "");
  const leitor = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const entradas = await leitor.getEntries();
    expect(entradas).toHaveLength(1);
    const entrada = entradas[0];
    if (!entrada || entrada.directory) throw new Error("Arquivo ausente no ZIP.");
    expect(entrada.filename).toBe("relatorio.pdf");
    return Buffer.from(await entrada.arrayBuffer({ password: SENHA, checkSignature: true }));
  } finally {
    await leitor.close();
  }
}
