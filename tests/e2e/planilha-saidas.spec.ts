// Planilha de saídas na interface: configuração na Gestão e envio pela vista
// Saídas, contra o Apps Script falso.
import { expect, test } from "@playwright/test";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";
import { ADMIN_E2E, comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const ABA = "Saiu mais cedo";

let gas: GasFalso;

test.describe("Google Planilhas de saídas", () => {
  test.beforeAll(async () => {
    gas = await criarGasFalso();
    gas.definirAba(ABA, [
      ["Data", "Aluno", "Turma", "Momento", "Justificativa", "Observação", "Liberado por"],
    ]);
    await criarMassaE2E();
    await comBanco(async (cliente) => {
      await cliente.query("delete from sincronizacoes_planilha where finalidade = 'SAIDAS'");
      await cliente.query(
        `insert into integracoes_planilha (id, finalidade, ativa, modo, atualizado_em)
         values ('saidas', 'SAIDAS', false, 'CONSERVADOR', now())
         on conflict (id) do update set
           finalidade = 'SAIDAS',
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
      await cliente.query(
        `insert into saidas_antecipadas (aluno_id, dia, momento, justificativa)
         select id, current_date, 'aula_1', 'C' from alunos where nome = 'E2E Aluno Um'`,
      );
    });
  });

  test.afterAll(async () => {
    await limparMassaE2E();
    await gas.fechar();
  });

  test("admin configura e coordenação envia as saídas do mês", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    const cartao = page.locator('[data-secao="planilha-saidas"]');
    await cartao.getByText("Conexão por Apps Script").click();

    // Token com senha.
    await cartao.getByRole("button", { name: "Gerar novo" }).click();
    const dialogoSenha = page.getByRole("dialog");
    await dialogoSenha.getByLabel("Senha do administrador").fill(ADMIN_E2E.senha);
    await dialogoSenha.getByRole("button", { name: "Confirmar" }).click();
    const campoToken = cartao.locator("input[readonly]");
    await expect
      .poll(async () => (await campoToken.inputValue()).length, { timeout: 15_000 })
      .toBeGreaterThan(20);
    gas.definirToken(await campoToken.inputValue());

    // Endereço, ativação e teste de conexão.
    await cartao.getByLabel("URL /exec").fill(gas.url);
    await cartao.getByRole("button", { name: "Salvar", exact: true }).click();
    await cartao.getByRole("switch", { name: "Integração de saídas ativa" }).click();
    await cartao.getByRole("button", { name: "Testar conexão" }).click();
    await expect(cartao.getByText(/Conectado a Planilha de teste/)).toBeVisible();

    // Estrutura da aba única.
    await cartao.getByRole("button", { name: "Conferir estrutura" }).click();
    await expect(cartao.getByText(ABA, { exact: true }).first()).toBeVisible();
    await cartao.getByRole("button", { name: "Salvar estrutura" }).click();
    await expect(page.getByText("Estrutura salva.")).toBeVisible();

    // Envio pela vista Saídas.
    await trocarVisao(page, "Saídas", "saidas");
    await page.getByRole("button", { name: "Enviar para a planilha" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/1 linha nova/)).toBeVisible();
    await dialogo.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/1 linha criada/)).toBeVisible();
    await expect.poll(() => gas.valor(ABA, 2, 2)).toBe("E2E Aluno Um");
    expect(gas.valor(ABA, 2, 1)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(gas.valor(ABA, 2, 5)).toBe("Consulta");

    // O segundo envio do mesmo mês não duplica linhas.
    await page.getByRole("button", { name: "Enviar para a planilha" }).click();
    await expect(page.getByRole("dialog").getByText(/0 linhas novas/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  });
});
