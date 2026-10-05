// Organização coletiva: mapa salvo, andamento, falhas por aba e ausência de reenvio.
import { expect, test, type Page } from "@playwright/test";
import { colunasDeApresentacao } from "../../src/domain/planilha-apresentacao";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
test.use({ serviceWorkers: "block" });
const nomes = ["QA Ano A", "QA Ano B", "QA Ano C"];

async function abrir(page: Page, comMapa = true) {
  await page.route("**/api/planilha", (rota) =>
    rota.fulfill({
      json: {
        integracao: {
          ativa: true,
          envioAutomatico: false,

          googleConectado: true,
          googlePlanilha: { id: "arquivo-sintetico", nome: "QA Planilha" },
          modo: "conservador",
          modoCompletoAte: null,
          sincronizacoes: [],
          alteradasDepois: 0,
          esquema: {
            planilha: { nome: "QA", url: "", fuso: "America/Fortaleza" },
            abas: [...nomes, "QA Notas"].map((nome) => ({ nome, oculta: false, colunas: [] })),
            mapa: comMapa
              ? nomes.map((aba, indice) => ({ aba, turmaOriginalId: `origem-${indice}` }))
              : [],
          },
        },
      },
    }),
  );
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
  await cartao.getByRole("combobox", { name: "Aba para organizar a apresentação" }).click();
  return cartao;
}

test("processa só as turmas mapeadas, mostra falhas e não repete a gravação", async ({
  page,
}, contexto) => {
  const confirmacoes: string[] = [];
  const leituras: string[] = [];
  let todasRecusadas = false;
  let liberar = () => {};
  const liberacao = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  await page.route("**/api/planilha/organizar", async (rota) => {
    const corpo = rota.request().postDataJSON() as {
      aba: string;
      planoHash?: string;
      emLote: boolean;
    };
    expect(corpo.emLote).toBe(true);
    if (corpo.planoHash) {
      confirmacoes.push(corpo.aba);
      if (corpo.aba === "QA Ano A") {
        await liberacao;
        await rota.fulfill({ json: { organizada: true, aba: corpo.aba } });
      } else await rota.abort("failed");
    } else {
      leituras.push(corpo.aba);
      if (todasRecusadas || corpo.aba === "QA Ano C")
        await rota.fulfill({
          status: 409,
          json: { error: "Confira a coluna Aluno antes de organizar." },
        });
      else
        await rota.fulfill({
          json: {
            previa: {
              aba: corpo.aba,
              cabecalhoLinha: 1,
              assinatura: "qa",
              planoHash: "a".repeat(64),
              colunas: colunasDeApresentacao(["Aluno", "29/09/2026", "Total"]),
            },
          },
        });
    }
  });
  const cartao = await abrir(page);
  await page.getByRole("option", { name: "Todas as turmas", exact: true }).click();
  const botao = cartao.getByRole("button", {
    name: "Organizar apresentação de todas as turmas",
    exact: true,
  });
  await botao.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo.getByText(/Abas prontas: 2 de 3/)).toBeVisible();
  expect(leituras).toEqual(nomes);
  await expect(dialogo.getByText("QA Ano C: Não será alterada", { exact: true })).toBeVisible();
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(confirmacoes).toEqual([]);
  await botao.click();
  await dialogo
    .getByRole("button", { name: "Aplicar apresentação", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect(dialogo.getByRole("status")).toHaveText("Aplicando 1 de 2: QA Ano A");
  await expect(dialogo.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
  expect(confirmacoes).toEqual(["QA Ano A"]);
  liberar();
  await expect(dialogo.getByRole("heading", { name: "Resultado da organização" })).toBeVisible();
  await expect(dialogo.getByText(/Concluídas: 1 de 3. Pendências: 2/)).toBeVisible();
  const resultado = dialogo.getByRole("list", { name: "Resultado por aba" });
  await expect(resultado.getByRole("listitem").filter({ hasText: "QA Ano A" })).toContainText(
    "Concluída",
  );
  await expect(resultado.getByRole("listitem").filter({ hasText: "QA Ano B" })).toContainText(
    "Confira a aba",
  );
  expect(confirmacoes).toEqual(["QA Ano A", "QA Ano B"]);
  await expect(
    dialogo.getByRole("button", { name: "Aplicar apresentação", exact: true }),
  ).toHaveCount(0);
  await dialogo.screenshot({
    path: `docs/imagens/planilha-todas-pendencias-${contexto.project.name}.png`,
  });
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  todasRecusadas = true;
  await botao.click();
  await expect(dialogo.getByText(/Abas prontas: 0 de 3/)).toBeVisible();
  await expect(
    dialogo.getByRole("button", { name: "Aplicar apresentação", exact: true }),
  ).toBeDisabled();
  expect(confirmacoes).toEqual(["QA Ano A", "QA Ano B"]);
});

test("sem mapa salvo, não oferece ação coletiva para as abas auxiliares", async ({ page }) => {
  await abrir(page, false);
  await expect(page.getByRole("option", { name: "Todas as turmas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "QA Notas", exact: true })).toBeVisible();
});
