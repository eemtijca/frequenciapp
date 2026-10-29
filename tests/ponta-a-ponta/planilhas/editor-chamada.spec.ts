// Editor da Gestão por turma e mês, com prévias sintéticas e nenhuma escrita no Google.
import { expect, test, type Page } from "@playwright/test";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

async function abrir(page: Page, completo: boolean, toque = false) {
  const turmaId = await comBanco(
    async (banco) =>
      (
        await banco.query<{ id: string }>(
          "select t.id from turmas t join series s on s.id=t.serie_id where s.nome='E2E Ano' and t.nome='A'",
        )
      ).rows[0]?.id ?? "",
  );
  expect(turmaId).not.toBe("");
  const previas: Record<string, unknown>[] = [];
  const envios: Record<string, unknown>[] = [];
  let liberado = completo;
  await page.route("**/api/planilha/modo-completo", (rota) => {
    liberado = true;
    return rota.fulfill({
      json: { modo: "completo", modoCompletoAte: new Date(Date.now() + 3600000).toISOString() },
    });
  });
  await page.route("**/api/planilha", (rota) =>
    rota.fulfill({
      json: {
        integracao: {
          ativa: true,
          googleConectado: true,
          googlePlanilha: { id: "sintetico", nome: "E2E Planilha" },
          modo: liberado ? "completo" : "conservador",
          modoCompletoAte: liberado ? new Date(Date.now() + 3600000).toISOString() : null,
          fuso: "America/Fortaleza",
          alteradasDepois: 0,
          sincronizacoes: [],
          esquema: {
            planilha: { nome: "E2E", url: "", fuso: "America/Fortaleza" },
            mapa: [{ turmaOriginalId: turmaId, aba: "E2E Aba A" }],
            abas: [{ nome: "E2E Aba A", colunas: [] }],
          },
        },
      },
    }),
  );
  await page.route("**/api/planilha/simular", (rota) => {
    const entrada = rota.request().postDataJSON() as Record<string, unknown>;
    previas.push(entrada);
    return rota.fulfill({
      json: {
        modalidade: completo ? "completo" : "conservador",
        planoHashGeral: "a".repeat(64),
        planos: [
          {
            turmaOriginalId: turmaId,
            rotulo: "E2E Ano A",
            aba: "E2E Aba A",
            dias: [],
            semEnvio: false,
            bloqueado: false,
            planoHashTurma: "a".repeat(64),
            resumo: {
              preencher: 0,
              sinalizar: 0,
              substituir: 0,
              limpar: 0,
              novasColunas: 0,
              novosAlunos: 1,
              vincular: 0,
              removerLinhas: (entrada.removerLinhas as number[] | undefined)?.length ?? 0,
              removerColunas: 0,
              puladasFormula: 0,
              puladasOcupadas: 0,
              ambiguidades: 0,
            },
            avisos: [],
            novasColunas: [],
            novosAlunos: [{ nome: "E2E Aluno Novo" }],
            substituir: [],
            sinalizar: [],
            candidatosRemocaoLinhas: [{ linha: 4, nome: "E2E Transferida" }],
            candidatosRemocaoColunas: [],
          },
        ],
      },
    });
  });
  await page.route("**/api/planilha/aplicar", (rota) => {
    envios.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { resultados: [{ resultado: "sucesso" }] } });
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
  const cartao = page.locator('[data-secao="planilha-frequencia"]');
  await cartao.getByRole("button", { name: /Planilha de frequência/ }).click();
  const editor = page.getByRole("region", { name: "Editar planilhas de chamada", exact: true });
  await expect(
    editor.getByRole("button", { name: "Adicionar alunos", exact: true }),
  ).toBeDisabled();
  expect(previas).toHaveLength(0);
  const turma = editor.getByRole("combobox", { name: "Turma da planilha para editar" });
  if (toque) await turma.tap();
  else await turma.click();
  await expect(turma).toHaveAttribute("aria-expanded", "true");
  const busca = page.getByRole("textbox", { name: "Filtrar opções", exact: true });
  await expect(busca).toBeVisible();
  await busca.fill("E2E Ano A");
  const opcao = page.getByRole("option", { name: "E2E Ano A", exact: true });
  if (toque) await opcao.tap();
  else await opcao.click();
  await expect(editor.getByRole("status")).toHaveText("Destino: E2E Aba A.");
  return { editor, previas, envios, turmaId };
}

test("adiciona alunos a partir da Gestão com prévia, sem liberar exclusões", async ({ page }) => {
  const { editor, previas, envios, turmaId } = await abrir(page, false);
  await expect(editor.getByRole("button", { name: "Corrigir dados", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Adicionar alunos", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar planilha de E2E Ano A", exact: true });
  await expect(dialogo.getByRole("list", { name: "Alunos que serão adicionados" })).toContainText(
    "E2E Aluno Novo",
  );
  await expect.poll(() => previas.length).toBeGreaterThan(0);
  expect(previas[0]).toMatchObject({
    turmaOriginalId: turmaId,
    somenteAlteradas: false,
    permitirNovosAlunos: true,
    permitirInserirColunas: false,
  });
  expect(envios).toHaveLength(0);
  await dialogo.getByRole("button", { name: "Aplicar alterações", exact: true }).click();
  await expect.poll(() => envios.length).toBe(1);
});

test("correção abre a prévia do mês com substituições habilitadas", async ({ page }) => {
  const { editor, previas, envios } = await abrir(page, true);
  await editor.getByRole("button", { name: "Corrigir dados", exact: true }).click();
  await expect.poll(() => previas.length).toBeGreaterThan(0);
  expect(previas[0]).toMatchObject({ somenteAlteradas: false, substituirDivergencias: true });
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(envios).toHaveLength(0);
});

test("retirada exige selecionar e confirmar linhas antes de aplicar", async ({ page }) => {
  const { editor, previas, envios } = await abrir(page, true);
  await editor.getByRole("button", { name: "Retirar linhas ou colunas", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Retirar E2E Transferida da planilha (linha 4)").check();
  const aplicar = dialogo.getByRole("button", { name: "Aplicar alterações", exact: true });
  await expect(aplicar).toBeDisabled();
  await dialogo.getByLabel(/Conferi as exclusões na aba/).check();
  expect(previas[0]).toMatchObject({ permitirNovosAlunos: false, permitirInserirColunas: false });
  await aplicar.click();
  await expect.poll(() => envios.length).toBe(1);
  expect(envios[0]).toMatchObject({ removerLinhas: [4] });
});

test("editor compacto mantém ações acessíveis no celular e recolhe a ajuda", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const { editor } = await abrir(page, false);
  const ajuda = editor.getByText(
    "Adicionar alunos cria as linhas que faltam e preenche as chamadas do mês.",
    { exact: true },
  );
  await expect(ajuda).toBeHidden();
  const adicionar = editor.getByRole("button", { name: "Adicionar alunos", exact: true });
  const remover = editor.getByRole("button", { name: "Retirar linhas ou colunas", exact: true });
  const limitesAdicionar = await adicionar.boundingBox();
  const limitesRemover = await remover.boundingBox();
  expect(limitesAdicionar).not.toBeNull();
  expect(limitesRemover).not.toBeNull();
  expect(limitesAdicionar?.height).toBeGreaterThanOrEqual(44);
  expect(limitesAdicionar?.y).toBe(limitesRemover?.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.getByText("Ajuda", { exact: true }).click();
  await expect(ajuda).toBeVisible();
  await editor.getByText("Ajuda", { exact: true }).click();
  await expect(ajuda).toBeHidden();
});

test("liberar o modo completo atualiza as ações sem perder a turma escolhida", async ({ page }) => {
  const { editor, envios } = await abrir(page, false);
  await expect(editor.getByRole("button", { name: "Corrigir dados", exact: true })).toBeDisabled();
  const cartao = page.locator('[data-secao="planilha-frequencia"]');
  await cartao.getByRole("button", { name: /^Modo completo/ }).click();
  await cartao.getByRole("button", { name: "Liberar modo completo", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Liberar modo completo", exact: true });
  await dialogo.getByLabel("Digite EDITAR PLANILHA").fill("EDITAR PLANILHA");
  await dialogo.getByLabel("Senha do administrador", { exact: true }).fill("SenhaSintetica2026");
  await dialogo.getByRole("button", { name: "Liberar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(editor.getByRole("button", { name: "Corrigir dados", exact: true })).toBeEnabled();
  await expect(
    editor.getByRole("button", { name: "Retirar linhas ou colunas", exact: true }),
  ).toBeEnabled();
  await editor.getByRole("button", { name: "Corrigir dados", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Editar planilha de E2E Ano A", exact: true }),
  ).toBeVisible();
  expect(envios).toHaveLength(0);
});

test.describe("seleção por toque", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("abre a turma no fim da página e permite editar no celular", async ({ page }) => {
    const { editor, envios } = await abrir(page, true, true);
    await editor.getByRole("button", { name: "Corrigir dados", exact: true }).tap();
    await expect(
      page.getByRole("dialog", { name: "Editar planilha de E2E Ano A", exact: true }),
    ).toBeVisible();
    expect(envios).toHaveLength(0);
  });
});
