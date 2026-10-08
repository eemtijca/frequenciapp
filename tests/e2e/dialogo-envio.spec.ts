// Diálogo de envio da Grade: prévia enxuta, opções recolhidas e remoção de colunas só no modo
// completo, com as respostas da API simuladas.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

// A API só oferece as colunas de dia criadas pela integração (a coluna Aluno nunca é candidata).
const COLUNAS = Array.from({ length: 11 }, (_, posicao) => {
  const indice = posicao + 1;
  const dia = String(indice + 1).padStart(2, "0");
  return {
    coluna: indice + 1,
    letra: String.fromCharCode(65 + indice),
    rotulo: `${dia}/10/2026`,
    data: `2026-10-${dia}`,
  };
});

function plano(turmaOriginalId: string) {
  return {
    turmaOriginalId,
    rotulo: "E2E Ano A",
    aba: "E2E Ano A",
    dias: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
    semEnvio: false,
    planoHashTurma: "hash-qa",
    bloqueado: false,
    resumo: {
      preencher: 7,
      sinalizar: 0,
      substituir: 0,
      limpar: 0,
      novasColunas: 0,
      novosAlunos: 0,
      vincular: 0,
      removerLinhas: 0,
      removerColunas: 0,
      puladasFormula: 0,
      puladasOcupadas: 0,
      ambiguidades: 0,
    },
    avisos: [],
    novasColunas: [],
    novosAlunos: [],
    substituir: [],
    sinalizar: [],
    candidatosRemocaoLinhas: [],
    candidatosRemocaoColunas: COLUNAS,
  };
}

async function abrirEnvio(page: Page, modo: "conservador" | "completo") {
  await page.route("**/api/planilha/estado", (rota) =>
    rota.fulfill({
      json: {
        estado: {
          ativa: true,
          modo,
          modoCompletoAte: null,
          podeEnviar: true,
          alteradasDepois: 0,
        },
      },
    }),
  );
  await page.route("**/api/planilha/simular", async (rota) => {
    const corpo = rota.request().postDataJSON() as { turmaOriginalId: string };
    await rota.fulfill({
      json: {
        modalidade: modo,
        planoHashGeral: "geral-qa",
        planos: [plano(corpo.turmaOriginalId)],
      },
    });
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Grade" }).click();
  await page
    .locator('section[aria-label="Grade de frequência"]')
    .getByRole("button", { name: /E2E Ano A/ })
    .click();
  await page.getByRole("button", { name: "Enviar para a planilha" }).click();
  return page.getByRole("dialog");
}

test("a prévia mostra só o que tem valor e recolhe as opções", async ({ page }) => {
  const dialogo = await abrirEnvio(page, "conservador");
  await expect(
    dialogo.getByRole("heading", { name: "Enviar E2E Ano A", exact: true }),
  ).toBeVisible();
  await expect(dialogo.getByLabel("Só chamadas pendentes")).toBeChecked();
  const lista = dialogo.getByRole("list", { name: "Turmas do envio" });
  await expect(lista.getByText("Aba E2E Ano A", { exact: true })).toBeVisible();
  await expect(lista.getByText("7 a preencher", { exact: true })).toBeVisible();
  await expect(lista.getByText("Dias 05/10 a 09/10 (5 dias)", { exact: true })).toBeVisible();
  // Contagens zeradas não aparecem.
  await expect(lista).not.toContainText("0 colunas");
  await expect(lista).not.toContainText("alunos novos");
  await expect(lista).not.toContainText("fórmulas protegidas");
  // As opções ficam recolhidas e, no modo conservador, a remoção aparece travada.
  await expect(dialogo.getByLabel("Criar colunas para dias sem coluna")).toBeHidden();
  await dialogo.getByText("Opções do envio", { exact: true }).click();
  await expect(dialogo.getByLabel("Criar colunas para dias sem coluna")).toBeChecked();
  await expect(dialogo.getByLabel("Acrescentar alunos sem linha")).toBeChecked();
  await expect(dialogo.getByLabel(/^Remover coluna/).first()).toBeDisabled();
  await expect(dialogo.getByText(/exige liberar o modo completo na Gestão/)).toBeVisible();
  await expect(dialogo.getByLabel(/Atualizar divergências/)).toHaveCount(0);
});

test("no modo completo as colunas de dia cabem em caixas e vão marcadas no envio", async ({
  page,
}) => {
  const corpos: Record<string, unknown>[] = [];
  await page.route("**/api/planilha/aplicar", async (rota) => {
    corpos.push(rota.request().postDataJSON() as Record<string, unknown>);
    await rota.fulfill({ json: { resultados: [{ resultado: "sucesso" }] } });
  });
  const dialogo = await abrirEnvio(page, "completo");
  await expect(dialogo.getByText(/Modo completo ativo/)).toBeVisible();
  await expect(dialogo.getByLabel(/^Remover coluna/)).toHaveCount(11);
  await dialogo.getByRole("button", { name: "Marcar todas", exact: true }).click();
  await expect(dialogo.getByLabel(/^Remover coluna/).first()).toBeChecked();
  await dialogo.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(dialogo.getByLabel(/^Remover coluna/).first()).not.toBeChecked();
  await dialogo.getByLabel("Remover coluna 02/10/2026 (B)").check();
  await dialogo.getByLabel("Remover coluna 03/10/2026 (C)").check();
  await dialogo.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]?.removerColunas).toEqual([2, 3]);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
