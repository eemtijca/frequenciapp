// Integração com o Google Planilhas na interface, contra o Apps Script falso:
// token, conexão, estrutura, mapa, prévia na Grade e desconexão.
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { criarGasFalso, type GasFalso } from "../helpers/gas-falso";
import { ADMIN_E2E, comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

// A resposta simulada por page.route exige que o service worker não intercepte a requisição.
// O funcionamento com service worker é verificado na suíte própria de PWA.
test.use({ serviceWorkers: "block" });

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
      // Execuções seguidas no mesmo banco não esbarram no limite de prévias.
      await cliente.query("delete from tentativas_entrada where chave like 'planilha:%'");
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
    const cartao = page.locator('[data-secao="planilha-frequencia"]');
    await cartao.getByText("Conexão por Apps Script").click();

    // Antes de conectar, a leitura da estrutura fica bloqueada.
    await expect(cartao.getByRole("button", { name: "Conferir estrutura" })).toBeDisabled();

    // Token com senha.
    await cartao.getByRole("button", { name: "Gerar novo" }).click();
    const dialogoSenha = page.getByRole("dialog");
    await dialogoSenha.getByLabel("Senha do administrador").fill(ADMIN_E2E.senha);
    await dialogoSenha.getByRole("button", { name: "Confirmar" }).click();
    const campoToken = cartao.locator("input[readonly]");
    await expect
      .poll(async () => (await campoToken.inputValue()).length, { timeout: 15_000 })
      .toBeGreaterThan(20);
    const token = await campoToken.inputValue();
    gas.definirToken(token);

    // Endereço, ativação e teste de conexão.
    await cartao.getByLabel("URL /exec").fill(gas.url);
    await cartao.getByRole("button", { name: "Salvar", exact: true }).click();
    await cartao.getByRole("switch", { name: "Integração ativa" }).click();
    await cartao.getByRole("button", { name: "Testar conexão" }).click();
    await expect(cartao.getByText(/Conectado a Planilha de teste/)).toBeVisible();
    await expect(cartao.getByText("Ligada", { exact: true })).toBeVisible();

    // Estrutura e mapa sugeridos.
    await cartao.getByRole("button", { name: "Conferir estrutura" }).click();
    const painelConfig = page.locator("#painel-configuracoes");
    await expect(painelConfig.getByText("E2E Ano A", { exact: true }).first()).toBeVisible();
    await cartao.getByRole("button", { name: "Salvar estrutura" }).click();
    await expect(page.getByText("Estrutura salva.")).toBeVisible();

    // O envio ao salvar a chamada nasce desligado e só se libera com a estrutura salva.
    const envioAoSalvar = cartao.getByRole("switch", { name: "Enviar ao salvar a chamada" });
    await expect(envioAoSalvar).toBeEnabled();
    await expect(envioAoSalvar).not.toBeChecked();

    // Envio de todas as turmas: por padrão só o que mudou; sem chamada, nada
    // a enviar, e o período inteiro fica como opção de conferência.
    await page.getByRole("button", { name: "Enviar todas as turmas" }).click();
    const previaGeral = page.getByRole("dialog");
    await expect(previaGeral.getByLabel("Só o que mudou desde o último envio")).toBeChecked();
    await expect(previaGeral.getByText(/Nada mudou desde o último envio/)).toBeVisible();
    await expect(previaGeral.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await previaGeral.getByLabel(/O período inteiro/).check();
    await expect(previaGeral.getByText(/E2E Ano A/)).toBeVisible();

    // Resposta perdida (504 da hospedagem): a turma vai numa requisição só
    // dela e fica sem confirmação, nunca como "nada foi alterado".
    const corpos: Record<string, unknown>[] = [];
    await page.route("**/api/planilha/aplicar", async (rota) => {
      corpos.push(rota.request().postDataJSON() as Record<string, unknown>);
      await rota.fulfill({ status: 504, contentType: "text/html", body: "<h1>504</h1>" });
    });
    await previaGeral.getByRole("button", { name: "Enviar" }).click();
    const lista = previaGeral.getByRole("list", { name: "Turmas do envio" });
    await expect(lista).toContainText("sem confirmação, confira a aba");
    await expect(
      previaGeral.getByText(/Não foi possível confirmar o resultado/).first(),
    ).toBeVisible();
    await expect(previaGeral.getByText(/Nada foi alterado/)).toHaveCount(0);
    expect(corpos).toHaveLength(1);
    expect(corpos[0]).toMatchObject({ somenteAlteradas: false });
    expect(corpos[0]?.todas).toBeUndefined();
    expect(typeof corpos[0]?.turmaOriginalId).toBe("string");
    await page.unroute("**/api/planilha/aplicar");
    // O X do diálogo também se chama Fechar; o do rodapé é o último.
    await previaGeral.getByRole("button", { name: "Fechar" }).last().click();

    // Prévia na Grade, sem enviar.
    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Grade" }).click();
    const turmaE2E = page
      .locator('section[aria-label="Grade de frequência"]')
      .getByRole("button", { name: /E2E Ano A/ });
    await turmaE2E.click();
    await page.getByRole("button", { name: "Enviar para a planilha" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel(/O período inteiro/).check();
    await expect(dialogo.getByText(/Aba E2E Ano A/)).toBeVisible();

    // Sem conexão, o envio fica bloqueado.
    await page.context().setOffline(true);
    await expect(dialogo.getByText(/Sem conexão/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await page.context().setOffline(false);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    // Desconexão, na zona de risco.
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    await cartao.getByRole("button", { name: "Zona de risco" }).click();
    await cartao.getByRole("button", { name: "Desconectar" }).click();
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
