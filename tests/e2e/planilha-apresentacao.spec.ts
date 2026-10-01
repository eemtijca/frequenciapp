// Prévia visual no desktop e celular, com dados fictícios e rede controlada.
import { expect, test } from "@playwright/test";
import { colunasDeApresentacao } from "../../src/domain/planilha-apresentacao";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
test.use({ serviceWorkers: "block" });

test("admin confere, cancela e aplica a apresentação com rolagem das colunas", async ({
  page,
}, contexto) => {
  const confirmacoes: unknown[] = [];
  await page.route("**/api/planilha-entradas/estado", (rota) =>
    rota.fulfill({ json: { podeEnviar: true, planilhaNome: "QA Planilha" } }),
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
            colunas: colunasDeApresentacao([
              "Data",
              "Aluno",
              "Turma",
              "Horário",
              "Motivo",
              "Registrado por",
              "Código",
            ]),
          },
        },
      });
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e entradas", "saidas");
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  const secao = page.getByRole("region", { name: "Planilha de entradas", exact: true });
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
  await expect(dialogo.getByRole("columnheader", { name: "Código", exact: true })).toBeInViewport();
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
