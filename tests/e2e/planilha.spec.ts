// Integração com o Google Planilhas na interface, contra o Apps Script falso:
// token, conexão, estrutura, mapa, prévia na Grade e desconexão.
import { expect, test } from "@playwright/test";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";
import { ADMIN_E2E, comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

let gas: GasFalso;

test.describe("Google Planilhas", () => {
  test.beforeAll(async () => {
    gas = await criarGasFalso();
    gas.definirAba("E2E Ano A", [
      ["Aluno", "Turma atual", "10/09", "Total"],
      ["E2E Aluno Um", "E2E Ano A", "P", ""],
      ["E2E Aluno Dois", "E2E Ano A", "", ""],
    ]);
    await criarMassaE2E();
    await comBanco(async (cliente) => {
      await cliente.query("delete from sincronizacoes_planilha");
      await cliente.query("delete from integracoes_planilha");
    });
  });

  test.afterAll(async () => {
    await limparMassaE2E();
    await gas.fechar();
  });

  test("admin conecta, confere a estrutura, salva o mapa e revisa a prévia", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();

    // Token com senha.
    await page.getByRole("button", { name: "Gerar novo" }).click();
    const dialogoSenha = page.getByRole("dialog");
    await dialogoSenha.getByLabel("Senha do administrador").fill(ADMIN_E2E.senha);
    await dialogoSenha.getByRole("button", { name: "Confirmar" }).click();
    const campoToken = page.locator("input[readonly]");
    await expect
      .poll(async () => (await campoToken.inputValue()).length, { timeout: 15_000 })
      .toBeGreaterThan(20);
    const token = await campoToken.inputValue();
    gas.definirToken(token);

    // Endereço, ativação e teste de conexão.
    await page.getByLabel("URL /exec").fill(gas.url);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.getByRole("switch", { name: "Integração ativa" }).click();
    await page.getByRole("button", { name: "Testar conexão" }).click();
    await expect(page.getByText(/Conectado a Planilha de teste/)).toBeVisible();

    // Estrutura e mapa sugeridos.
    await page.getByRole("button", { name: "Conferir estrutura" }).click();
    await expect(page.getByText("E2E Ano A").first()).toBeVisible();
    await page.getByRole("button", { name: "Salvar estrutura" }).click();
    await expect(page.getByText("Estrutura salva.")).toBeVisible();

    // Prévia na Grade, sem enviar.
    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Grade" }).click();
    await page.getByRole("button", { name: "Enviar para a planilha" }).click();
    await expect(page.getByRole("dialog").getByText(/Aba E2E Ano A/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

    // Desconexão.
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    await page.getByRole("button", { name: "Desconectar" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Desconectar" }).click();
    await expect(
      page.getByText("Integração desconectada. A planilha não foi alterada."),
    ).toBeVisible();
  });
});
