// Integração com o Google Planilhas na interface, contra o Apps Script falso:
// token, conexão, estrutura, mapa, prévia na Grade e desconexão.
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
      await cliente.query(
        `insert into integracoes_planilha (id, ativa, modo, atualizado_em)
         values ('principal', false, 'CONSERVADOR', now())
         on conflict (id) do update set
           ativa = false,
           endpoint = null,
           token = null,
           versao_script = null,
           esquema = null,
           assinatura_esquema = null,
           esquema_em = null,
           modo = 'CONSERVADOR',
           modo_completo_ate = null,
           atualizado_em = now()`,
      );
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

    // Envio do mês de todas as turmas: a prévia lista a turma mapeada.
    await page.getByRole("button", { name: "Enviar o mês de todas as turmas" }).click();
    const previaGeral = page.getByRole("dialog");
    await expect(previaGeral.getByText(/E2E Ano A/)).toBeVisible();
    await previaGeral.getByRole("button", { name: "Cancelar" }).click();

    // Prévia na Grade, sem enviar.
    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Grade" }).click();
    await page.getByRole("button", { name: "Enviar para a planilha" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/Aba E2E Ano A/)).toBeVisible();

    // Sem conexão, o envio fica bloqueado.
    await page.context().setOffline(true);
    await expect(dialogo.getByText(/Sem conexão/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await page.context().setOffline(false);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    // Desconexão.
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    await page.getByRole("button", { name: "Desconectar" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Desconectar" }).click();
    await expect(
      page.getByText("Integração desconectada. A planilha não foi alterada."),
    ).toBeVisible();
  });

  test("baixa o CSV da turma de origem", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Grade" }).click();
    const grade = page.locator('section[aria-label="Grade de frequência"]');
    const pilula = grade.getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false)) await pilula.click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Baixar planilha (CSV)" }).click(),
    ]);
    const caminho = await download.path();
    expect(caminho).toBeTruthy();
    const conteudo = await readFile(caminho ?? "", "utf8");
    expect(conteudo.startsWith("\uFEFF")).toBe(true);
    expect(conteudo).toContain("Aluno;Turma atual;");
    expect(conteudo).toContain("E2E Aluno Um");
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    expect(download.suggestedFilename()).toContain("e2e-ano-a");
  });
});
