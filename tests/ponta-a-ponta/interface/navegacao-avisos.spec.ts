// Avisos de sucesso preservam o acesso à Gestão no celular e no tablet.
import { expect, test } from "@playwright/test";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "../helpers/configuracoes";
import { abrirNavegacao, aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { registrarTestemunha } from "../helpers/testemunha-aviso";

let inicial: ConfiguracaoOrigem | null = null;

test.beforeEach(async () => {
  inicial = await lerOrigem();
});

test.afterEach(async () => {
  if (inicial) await definirOrigem(inicial);
});

for (const largura of [390, 800]) {
  test(`em ${largura} px, Gestão recebe o toque com o aviso de sucesso visível`, async ({
    page,
    hasTouch,
  }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);

    // Carrega a Chamada antes de gerar o aviso, inclusive o dia anterior ao
    // resumo dominical. A visão visitada permanece montada ao retornar à Gestão.
    await trocarVisao(page, "Chamada", "chamada");
    const chamada = page.locator('section[aria-label="Fazer chamada"]');
    await expect(chamada).toBeVisible();
    await aguardarHidratacao(page, 'section[aria-label="Fazer chamada"] button');
    const vazia = chamada.getByText("Nenhuma turma cadastrada", { exact: true });
    const alunos = chamada.getByRole("list", { name: "Alunos da chamada", exact: true });
    const semAlunos = chamada.getByText("Nenhum aluno ativo nesta turma", { exact: true });
    await expect(vazia.or(alunos).or(semAlunos)).toBeVisible();
    await expect(chamada.getByText("Carregando chamada...", { exact: true })).toBeHidden();
    await expect(
      chamada.getByRole("button", { name: "Tentar novamente", exact: true }),
    ).toBeHidden();
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();

    // Mede o cabeçalho antes da janela curta do aviso.
    const caixaCabecalho = await page.getByRole("banner").boundingBox();
    expect(caixaCabecalho).not.toBeNull();

    const origem = page.getByRole("group", { name: "Turma de origem na Chamada", exact: true });
    await origem.getByRole("switch").click();
    await page.getByRole("button", { name: "Salvar configurações", exact: true }).click();
    const confirmar = page.getByRole("alertdialog", { name: "Salvar configurações?", exact: true });
    const resposta = page.waitForResponse(
      (item) =>
        new URL(item.url()).pathname === "/api/configuracoes/lote" &&
        item.request().method() === "POST",
    );
    await confirmar.getByRole("button", { name: "Salvar configurações", exact: true }).click();
    expect((await resposta).status()).toBe(200);

    const aviso = page.locator("[data-sonner-toast]").filter({
      has: page.locator("[data-title]").filter({ hasText: /^Configurações salvas\.$/ }),
    });
    await expect(aviso).toBeVisible();
    await expect
      .poll(async () => {
        const caixaAviso = await aviso.boundingBox();
        return (
          caixaAviso !== null &&
          caixaAviso.y >= (caixaCabecalho?.y ?? 0) + (caixaCabecalho?.height ?? 0)
        );
      })
      .toBe(true);

    // A navegação segue real; o pré-aquecimento reduz trabalho, mas não garante
    // que a interação termine antes de o aviso expirar e não cobre Chamada fria.
    await trocarVisao(page, "Chamada", "chamada", { manterResumo: true });
    await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada");
    const navegacao = await abrirNavegacao(page);
    const gestao = navegacao.getByRole("button", { name: /^Gestão(?: Alterações não salvas)?$/ });

    // Registra geometria e estilos no evento real, antes de React trocar a visão.
    // Isso não prova que outro elemento não encobre visualmente o aviso; uma
    // captura estática separada pode fornecer apenas evidência visual parcial.
    const testemunha = await gestao.evaluateHandle(
      registrarTestemunha,
      hasTouch ? "touchstart" : "pointerdown",
    );

    await expect(aviso).toBeVisible();
    if (hasTouch) await gestao.tap();
    else await gestao.click();
    const registro = await testemunha.jsonValue();
    expect(registro).toEqual({
      recebido: true,
      confiavel: true,
      avisoVisivel: true,
      instante: expect.any(Number),
    });
    expect(registro.instante).toBeGreaterThan(0);
    await expect(
      page.getByRole("dialog", { name: "Menu do aplicativo", exact: true }),
    ).toBeHidden();
    await expect(page.locator("main")).toHaveAttribute("data-visao", "gestao");
    await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
  });
}
