// Integração com o Google Planilhas na interface, contra a Sheets API sintética:
// conta Google, estrutura, mapa, prévia na Grade e desconexão.
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

// A resposta simulada por page.route exige que o service worker não intercepte a requisição.
// O funcionamento com service worker é verificado na suíte própria de PWA.
test.use({ serviceWorkers: "block" });

let google: GoogleFalso;

test.describe("Google Planilhas", () => {
  test.beforeAll(async () => {
    google = await criarGoogleFalso();
    google.definirAba("E2E Ano A", [
      ["Frequência · E2E Ano A"],
      ["P = presente · F = falta. Atualize as marcações no aplicativo."],
      [],
      ["Aluno", "Turma atual", "10/09", "Total"],
      ["E2E Aluno Um", "E2E Ano A", "P", ""],
      ["E2E Aluno Dois", "E2E Ano A", "", ""],
    ]);
    google.definirAba("E2E Ano B", [
      ["Frequência · E2E Ano B"],
      ["P = presente · F = falta"],
      [],
      ["Aluno", "Turma atual", "29/09", "Total"],
      ["E2E Aluno Três", "E2E Ano B", "P", ""],
    ]);
    await criarMassaE2E();
    await comBanco(async (cliente) => {
      await cliente.query(
        "insert into turmas (serie_id, nome) select id, 'B' from series where nome = 'E2E Ano'",
      );
      await cliente.query("delete from sincronizacoes_planilha");
      // Execuções seguidas no mesmo banco não esbarram no limite de prévias.
      await cliente.query("delete from tentativas_entrada where chave like 'planilha:%'");
      await cliente.query(
        `insert into integracoes_planilha (id, ativa, modo, atualizado_em)
         values ('principal', false, 'CONSERVADOR', now())
         on conflict (id) do update set
           ativa = false,
           google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
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
    await google.fechar();
  });

  test("admin conecta, confere a estrutura, salva o mapa e revisa a prévia", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    const cartao = page.locator('[data-secao="planilha-frequencia"]');
    await expect(cartao.getByRole("button", { name: "Entrar com Google" })).toBeVisible();
    await expect(cartao.getByText("Conexão por Apps Script")).toHaveCount(0);
    await expect(cartao.getByRole("button", { name: "Conferir estrutura" })).toBeDisabled();
    await comBanco((cliente) => google.conectar(cliente, "FREQUENCIA"));
    await page.reload();
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    await expect(cartao.getByText("Google conectado", { exact: true })).toBeVisible();

    // Estrutura e mapa sugeridos.
    await cartao.getByRole("button", { name: "Conferir estrutura" }).click();
    const painelConfig = page.locator("#painel-configuracoes");
    await expect(painelConfig.getByText("E2E Ano A", { exact: true }).first()).toBeVisible();
    await cartao.getByRole("button", { name: "Salvar estrutura" }).click();
    await expect(page.getByText("Estrutura salva.", { exact: true })).toBeVisible();

    // Organização visual com prévia, cancelamento sem escrita e confirmação.
    await cartao.getByRole("combobox", { name: "Aba para organizar a apresentação" }).click();
    await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
    const organizar = cartao.getByRole("button", { name: "Organizar apresentação de E2E Ano A" });
    await organizar.click();
    const apresentacao = page.getByRole("alertdialog");
    await expect(
      apresentacao.getByRole("heading", { name: "Organizar apresentação da aba E2E Ano A?" }),
    ).toBeVisible();
    await expect(
      apresentacao.getByRole("columnheader", { name: "Aluno", exact: true }),
    ).toBeVisible();
    await apresentacao.screenshot({ path: "test-results/planilha-apresentacao-previa.png" });
    const chamadasAntes = google.chamadas().filter((acao) => acao === "gravar").length;
    await apresentacao.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(google.chamadas().filter((acao) => acao === "gravar").length).toBe(chamadasAntes);
    await organizar.click();
    await apresentacao.getByRole("button", { name: "Aplicar apresentação" }).click();
    await expect(page.getByText("Apresentação da planilha atualizada.")).toBeVisible();
    expect(google.chamadas().filter((acao) => acao === "gravar").length).toBe(chamadasAntes + 1);
    expect(google.valor("E2E Ano A", 5, 1)).toBe("E2E Aluno Um");

    // Todas as turmas organiza e corrige as duas abas, com uma confirmação.
    await cartao.getByRole("combobox", { name: "Aba para organizar a apresentação" }).click();
    await page.getByRole("option", { name: "Todas as turmas", exact: true }).click();
    const todas = cartao.getByRole("button", {
      name: "Organizar apresentação de todas as turmas",
      exact: true,
    });
    await todas.click();
    await expect(apresentacao.getByText(/Abas prontas: 2 de 2/)).toBeVisible();
    await apresentacao.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(google.chamadas().filter((acao) => acao === "gravar").length).toBe(chamadasAntes + 1);
    await todas.click();
    await apresentacao.getByRole("button", { name: "Aplicar apresentação", exact: true }).click();
    await expect(
      apresentacao.getByRole("heading", { name: "Resultado da organização" }),
    ).toBeVisible();
    await expect(apresentacao.getByText(/Concluídas: 2 de 2. Pendências: 0/)).toBeVisible();
    await apresentacao.getByRole("button", { name: "Fechar", exact: true }).click();
    const corrigir = cartao.getByRole("button", {
      name: "Corrigir cabeçalho e datas de todas as turmas",
      exact: true,
    });
    await cartao.getByLabel("Ano das datas sem ano").fill("2026");
    await corrigir.click();
    await expect(
      apresentacao.getByText(/Linhas a retirar: 3. Datas a corrigir: 1/).first(),
    ).toBeVisible();
    const previa = apresentacao.getByRole("region", {
      name: "Prévia da apresentação de E2E Ano A",
      exact: true,
    });
    await previa.evaluate((elemento) => {
      elemento.scrollLeft = elemento.scrollWidth;
    });
    await expect(
      apresentacao.getByRole("columnheader", { name: "10/09/2026", exact: true }),
    ).toBeInViewport();
    const caixa = await apresentacao.boundingBox();
    expect(caixa?.x).toBeGreaterThanOrEqual(0);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    await apresentacao.screenshot({ path: "test-results/planilha-todas-previa.png" });
    await apresentacao.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(google.valor("E2E Ano A", 1, 1)).toContain("Frequência");
    expect(google.valor("E2E Ano B", 1, 1)).toContain("Frequência");
    await corrigir.click();
    await apresentacao
      .getByRole("button", { name: "Aplicar correção", exact: true })
      .evaluate((elemento) => {
        (elemento as HTMLButtonElement).click();
        (elemento as HTMLButtonElement).click();
      });
    await expect(apresentacao.getByText(/Concluídas: 2 de 2. Pendências: 0/)).toBeVisible();
    expect(google.chamadas().filter((acao) => acao === "gravar").length).toBe(chamadasAntes + 5);
    expect(google.valor("E2E Ano A", 1, 1)).toBe("Aluno");
    expect(google.valor("E2E Ano A", 1, 3)).toBe("10/09/2026");
    expect(google.valor("E2E Ano A", 2, 1)).toBe("E2E Aluno Um");
    expect(google.valor("E2E Ano B", 1, 1)).toBe("Aluno");
    expect(google.valor("E2E Ano B", 1, 3)).toBe("29/09/2026");
    expect(google.valor("E2E Ano B", 2, 3)).toBe("P");
    for (const nome of ["E2E Ano A", "E2E Ano B"])
      expect(google.abas().some((aba) => aba.startsWith(`_frequenciapp_backup_${nome}_`))).toBe(
        false,
      );
    await apresentacao.screenshot({ path: "test-results/planilha-todas-resultado.png" });
    await apresentacao.getByRole("button", { name: "Fechar", exact: true }).click();

    // O envio ao salvar permanece desligado e o mapa continua disponível.
    const envioAoSalvar = cartao.getByRole("switch", { name: "Enviar ao salvar a chamada" });
    await expect(envioAoSalvar).toBeEnabled();
    await expect(envioAoSalvar).not.toBeChecked();

    // Envio de todas as turmas: por padrão só pendências; sem chamada, nada
    // a enviar, e o período inteiro fica como opção de conferência.
    await page.getByRole("button", { name: "Enviar todas as turmas" }).click();
    const previaGeral = page.getByRole("dialog");
    await expect(previaGeral.getByLabel("Só chamadas pendentes")).toBeChecked();
    await expect(previaGeral.getByText(/Nenhuma chamada pendente/)).toBeVisible();
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
    await expect.poll(() => corpos.length).toBe(2);
    for (const corpo of corpos) {
      expect(corpo).toMatchObject({ somenteAlteradas: false });
      expect(corpo.todas).toBeUndefined();
      expect(typeof corpo.turmaOriginalId).toBe("string");
    }
    expect(new Set(corpos.map((corpo) => corpo.turmaOriginalId)).size).toBe(2);
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
    await page.getByRole("button", { name: "Baixar planilha (CSV)" }).click();
    const downloadDialogo = page.getByRole("dialog", { name: "Preparar download" });
    await downloadDialogo.getByLabel("Arquivo original sem senha").check();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadDialogo.getByRole("button", { name: "Baixar arquivo original" }).click(),
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
