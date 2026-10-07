// Prévia visual no desktop e celular, com dados fictícios e rede controlada.
import { expect, test } from "@playwright/test";
import { colunasDeApresentacao } from "../../src/domain/planilha-apresentacao";
import { CABECALHO_ENTRADAS } from "../../src/domain/planilha-entradas";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
test.use({ serviceWorkers: "block" });

test("admin confere, cancela e aplica a apresentação com rolagem das colunas", async ({
  page,
}, contexto) => {
  const confirmacoes: unknown[] = [];
  await page.route(/\/api\/planilha-saidas$/, (rota) =>
    rota.fulfill({
      json: {
        integracao: {
          ativa: true,
          contaGoogle: true,
          googlePlanilha: { id: "qa", nome: "QA Planilha" },
          esquema: {
            planilha: {
              nome: "QA Planilha",
              url: "https://exemplo.invalid/qa",
              fuso: "America/Fortaleza",
            },
            abas: [],
            aba: "Saiu mais cedo",
          },
          esquemaEm: "2026-10-01T12:00:00.000Z",
          modo: "conservador",
          modoCompletoAte: null,
          envioAutomatico: false,
          atualizadoEm: "2026-10-01T12:00:00.000Z",
          fuso: "America/Fortaleza",
          ultimoErro: null,
          sincronizacoes: [],
        },
      },
    }),
  );
  await page.route("**/api/planilha-entradas/organizar", async (rota) => {
    const corpo = rota.request().postDataJSON() as { planoHash?: string };
    if (corpo.planoHash) {
      confirmacoes.push(corpo);
      await rota.fulfill({ json: { organizada: true, aba: "Entradas" } });
    } else
      await rota.fulfill({
        json: {
          previa: {
            aba: "Entradas",
            cabecalhoLinha: 1,
            assinatura: "qa",
            planoHash: "a".repeat(64),
            colunas: colunasDeApresentacao([...CABECALHO_ENTRADAS]),
          },
        },
      });
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
  const cartao = page.locator('[data-secao="planilha-saidas"]');
  await cartao.getByRole("button", { name: /Planilha de entradas e saídas/ }).click();
  const secao = cartao.locator('[data-secao="planilha-entradas-preparo"]');
  await secao.screenshot({
    path: `docs/imagens/planilha-apresentacao-acesso-${contexto.project.name}.png`,
  });
  const botao = secao.getByRole("button", {
    name: "Organizar apresentação de Entradas",
    exact: true,
  });
  await botao.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo.getByRole("columnheader", { name: "Aluno", exact: true })).toBeVisible();
  const previa = dialogo.getByRole("region", { name: "Prévia da apresentação" });
  expect(await previa.evaluate((elemento) => elemento.scrollWidth > elemento.clientWidth)).toBe(
    true,
  );
  const caixa = await dialogo.boundingBox();
  const largura = page.viewportSize()?.width ?? 0;
  expect(caixa?.x).toBeGreaterThanOrEqual(0);
  expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(largura);
  await previa.evaluate((elemento) => {
    elemento.scrollLeft = elemento.scrollWidth;
  });
  await expect(
    dialogo.getByRole("columnheader", { name: "Responsável", exact: true }),
  ).toBeInViewport();
  await previa.evaluate((elemento) => {
    elemento.scrollLeft = 0;
  });
  await dialogo.screenshot({
    path: `docs/imagens/planilha-apresentacao-previa-${contexto.project.name}.png`,
  });
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(confirmacoes).toHaveLength(0);
  await botao.click();
  await dialogo.getByRole("button", { name: "Aplicar apresentação" }).evaluate((elemento) => {
    (elemento as HTMLButtonElement).click();
    (elemento as HTMLButtonElement).click();
  });
  await expect(page.getByText("Apresentação da planilha atualizada.")).toBeVisible();
  expect(confirmacoes).toEqual([{ aba: "Entradas", planoHash: "a".repeat(64) }]);
});
