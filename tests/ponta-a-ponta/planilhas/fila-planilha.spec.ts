// Painel da fila de envios automáticos na Gestão: contagens, itens pendentes e ações da
// administração, com as respostas da API simuladas.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

const ESTADO = {
  contagens: { AGUARDANDO: 1, EM_ANDAMENTO: 0, CONCLUIDO: 2, FALHOU: 1, DESCARTADO: 0 },
  conferenciasPendentes: 0,
  itens: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      classe: "aberto",
      tipo: "SAIDAS",
      estado: "AGUARDANDO",
      dia: "2026-10-07",
      turmaRotulo: null,
      tentativas: 1,
      resultado: "falhou",
      requerConferencia: false,
      podeReprocessar: false,
      podeResolver: false,
      falhaPreparo: null,
      escopos: [],
      erro: null,
      criadoEm: "2026-10-07T12:00:00.000Z",
      proximaTentativaEm: "2026-10-07T12:30:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      classe: "falha",
      tipo: "FREQUENCIA",
      estado: "FALHOU",
      dia: "2026-10-06",
      turmaRotulo: "E2E Ano A",
      tentativas: 5,
      resultado: "falhou",
      requerConferencia: false,
      podeReprocessar: true,
      podeResolver: false,
      falhaPreparo: null,
      escopos: [],
      erro: null,
      criadoEm: "2026-10-06T12:00:00.000Z",
      proximaTentativaEm: null,
    },
  ],
};

async function abrirSecao(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
  const secao = page.locator('[data-secao="planilha-fila"]');
  await secao.getByRole("button", { name: /Fila de envios automáticos/ }).click();
  return secao;
}

test("mostra as contagens e os pendentes e permite processar, descartar e reenfileirar", async ({
  page,
}) => {
  const chamadas: string[] = [];
  await page.route("**/api/planilha/fila", (rota) => rota.fulfill({ json: ESTADO }));
  await page.route("**/api/planilha/fila/**", async (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    chamadas.push(`${rota.request().method()} ${caminho}`);
    await rota.fulfill({
      json: caminho.endsWith("/processar")
        ? { processados: 2, concluidos: 2, falhas: 0, abertos: 0, aguardandoAte: null }
        : { ok: true },
    });
  });
  const secao = await abrirSecao(page);

  await expect(secao.getByText("Aguardando: 1", { exact: true })).toBeHidden();
  await secao.getByText("Detalhes da fila", { exact: true }).click();
  await expect(secao.getByText("Aguardando: 1", { exact: true })).toBeVisible();
  await expect(secao.getByText("Concluído: 2", { exact: true })).toBeVisible();
  await expect(secao.getByText("Falhou: 1", { exact: true })).toBeVisible();
  // Os envios concluídos entram só na contagem: a lista traz o que ainda falta enviar.
  const itens = secao.getByRole("list", { name: "Itens da fila" }).getByRole("listitem");
  await expect(itens).toHaveCount(2);
  await expect(secao.getByText("Concluído", { exact: true })).toHaveCount(0);
  await expect(itens.nth(0)).toContainText("Saída");
  await expect(itens.nth(0)).toContainText("1 tentativa");
  await expect(itens.nth(1)).toContainText("E2E Ano A");
  await expect(itens.nth(1)).toContainText("5 tentativas");
  // Cada ação só aparece no estado em que vale.
  await expect(itens.nth(0).getByRole("button", { name: "Descartar" })).toBeVisible();
  await expect(itens.nth(0).getByRole("button", { name: "Tentar novamente" })).toHaveCount(0);
  await expect(itens.nth(1).getByRole("button", { name: "Tentar novamente" })).toBeVisible();

  await secao.getByRole("button", { name: "Processar agora" }).click();
  await expect(page.getByText("Fila processada.", { exact: true })).toBeVisible();
  await itens.nth(0).getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("Item descartado.", { exact: true })).toBeVisible();
  await itens.nth(1).getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Item voltou ao fim da fila.", { exact: true })).toBeVisible();
  expect(chamadas).toEqual([
    "POST /api/planilha/fila/processar",
    "POST /api/planilha/fila/11111111-1111-4111-8111-111111111111/descartar",
    "POST /api/planilha/fila/22222222-2222-4222-8222-222222222222/reenfileirar",
  ]);

  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("distingue conferência de pendência segura e registra a conferência", async ({ page }) => {
  const chamadas: { caminho: string; corpo: unknown }[] = [];
  await page.route("**/api/planilha/fila", (rota) =>
    rota.fulfill({
      json: {
        contagens: { AGUARDANDO: 0, EM_ANDAMENTO: 0, CONCLUIDO: 2, FALHOU: 0, DESCARTADO: 0 },
        conferenciasPendentes: 2,
        itens: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            classe: "conferencia",
            tipo: "FREQUENCIA",
            estado: "CONCLUIDO",
            dia: "2026-10-08",
            turmaRotulo: "E2E Ano A",
            tentativas: 1,
            resultado: "sem_confirmacao",
            requerConferencia: true,
            podeReprocessar: false,
            podeResolver: true,
            falhaPreparo: null,
            escopos: [
              {
                origemId: "44444444-4444-4444-8444-444444444444",
                origemRotulo: "E2E Ano A",
                destino: "aba:Outubro",
              },
            ],
            erro: null,
            criadoEm: "2026-10-08T12:00:00.000Z",
            proximaTentativaEm: null,
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            classe: "origem_nao_processada",
            tipo: "FREQUENCIA",
            estado: "CONCLUIDO",
            dia: "2026-10-09",
            turmaRotulo: "E2E Ano B",
            tentativas: 1,
            resultado: "sem_mapa",
            requerConferencia: true,
            podeReprocessar: true,
            podeResolver: false,
            falhaPreparo: null,
            escopos: [],
            erro: null,
            criadoEm: "2026-10-09T12:00:00.000Z",
            proximaTentativaEm: null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/planilha/fila/**", async (rota) => {
    chamadas.push({
      caminho: new URL(rota.request().url()).pathname,
      corpo: JSON.parse(rota.request().postData() ?? "{}") as unknown,
    });
    await rota.fulfill({ json: { ok: true } });
  });
  const secao = await abrirSecao(page);
  const itens = secao.getByRole("list", { name: "Itens da fila" }).getByRole("listitem");
  await expect(itens.nth(0).getByText("Conferência necessária")).toBeVisible();
  await expect(itens.nth(0).getByText("E2E Ano A", { exact: false })).toBeVisible();
  await expect(itens.nth(0).getByText("aba:Outubro", { exact: false })).toBeVisible();
  await itens.nth(0).getByRole("button", { name: "Registrar conferência" }).click();
  await expect(page.getByText("Conferência registrada para este item.")).toBeVisible();
  await expect(itens.nth(1).getByText("Ação necessária")).toBeVisible();
  await expect(itens.nth(1).getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  expect(chamadas).toEqual([
    {
      caminho: "/api/planilha/fila/33333333-3333-4333-8333-333333333333/resolver",
      corpo: { confirmado: true },
    },
  ]);
});

test("com a fila vazia, o resumo e a lista dizem isso", async ({ page }) => {
  await page.route("**/api/planilha/fila", (rota) =>
    rota.fulfill({
      json: {
        contagens: { AGUARDANDO: 0, EM_ANDAMENTO: 0, CONCLUIDO: 0, FALHOU: 0, DESCARTADO: 0 },
        conferenciasPendentes: 0,
        itens: [],
      },
    }),
  );
  const secao = await abrirSecao(page);
  await expect(secao.getByText("Fila vazia", { exact: true }).first()).toBeVisible();
  await expect(secao.getByText("Nenhum envio pendente na fila.")).toBeVisible();
});
