// Planilha de saídas na interface: configuração na Gestão e envio pela vista
// Saídas, contra a Sheets API sintética.
import { expect, test } from "@playwright/test";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const ABA = "Saiu mais cedo";

let google: GoogleFalso;

test.describe("Google Planilhas de saídas", () => {
  test.beforeAll(async () => {
    google = await criarGoogleFalso();
    google.definirAba(ABA, [
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
           google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
       esquema = null,
           assinatura_esquema = null,
           esquema_em = null,
           modo = 'CONSERVADOR',
           modo_completo_ate = null,
           atualizado_em = now()`,
      );
      await cliente.query(
        `insert into saidas_antecipadas (aluno_id, dia, momento, justificativa)
         select id, date '2026-08-10', 'aula_1', 'C' from alunos where nome = 'E2E Aluno Um'`,
      );
    });
  });

  test.afterAll(async () => {
    await limparMassaE2E();
    await google.fechar();
  });

  test("admin configura e coordenação envia as saídas do mês", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
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
    await expect(cartao.getByRole("button", { name: "Conectar conta Google" })).toBeVisible();
    await expect(cartao.getByText("Conexão por Apps Script")).toHaveCount(0);
    await expect(cartao.getByRole("button", { name: "Conferir estrutura" })).toBeDisabled();
    await comBanco((cliente) => google.conectar(cliente, "SAIDAS"));
    await page.reload();
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    await page
      .getByRole("navigation", { name: "Categorias de configurações" })
      .getByRole("button", { name: "Planilhas", exact: true })
      .click();
    await cartao.getByRole("button", { name: /Planilha de entradas e saídas/ }).click();
    await expect(cartao.getByText("Google conectado", { exact: true })).toBeVisible();

    await cartao.getByRole("button", { name: "Conferir estrutura" }).click();
    await expect(cartao.getByText(ABA, { exact: true }).first()).toBeVisible();
    await cartao.getByRole("button", { name: "Salvar estrutura" }).click();
    await expect(page.getByText("Estrutura salva.")).toBeVisible();

    // As duas abas são preparadas e organizadas no mesmo cartão, com as mesmas colunas.
    const preparo = cartao.locator('[data-secao="planilha-entradas-preparo"]');
    await expect(
      preparo.getByRole("button", { name: "Organizar apresentação de Entradas", exact: true }),
    ).toBeVisible();
    await preparo.getByRole("button", { name: "Preparar aba Entradas", exact: true }).click();
    await page.getByRole("button", { name: "Preparar aba", exact: true }).click();
    await expect(page.getByText(/^Aba Entradas criada e organizada\./)).toBeVisible();
    expect([1, 2, 3, 4, 5, 6, 7].map((coluna) => google.valor("Entradas", 1, coluna))).toEqual([
      "Data",
      "Aluno",
      "Turma",
      "Momento",
      "Justificativa",
      "Observação",
      "Responsável",
    ]);

    // Envio pela vista Saídas.
    await trocarVisao(page, "Saídas e entradas", "saidas");
    await page.getByRole("button", { name: "Enviar saídas e entradas para a planilha" }).click();
    await page.getByRole("button", { name: /Mês do envio das saídas e entradas/ }).click();
    await page
      .getByRole("dialog", { name: "Mês do envio das saídas e entradas" })
      .getByRole("button", { name: "Agosto" })
      .click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/1 linha nova/)).toBeVisible();
    // As entradas participam do mesmo diálogo, agora com a aba Entradas já preparada.
    await expect(dialogo.getByText("Aba Entradas", { exact: true })).toBeVisible();
    await dialogo.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/1 linha criada/)).toBeVisible();
    await expect.poll(() => google.valor(ABA, 2, 2)).toBe("E2E Aluno Um");
    expect(google.valor(ABA, 2, 1)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(google.valor(ABA, 2, 5)).toBe("Consulta");

    // O segundo envio do mesmo mês não duplica linhas.
    await page.getByRole("button", { name: "Enviar saídas e entradas para a planilha" }).click();
    // Saídas e Entradas (já preparada) mostram, cada uma, zero linhas novas.
    await expect(page.getByRole("dialog").getByText(/0 linhas novas/)).toHaveCount(2);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  });
});
