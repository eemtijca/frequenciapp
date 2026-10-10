// Menu lateral do celular: foco, redimensionamento, conta e rascunho da Chamada.
import { expect, test, type Locator } from "@playwright/test";
import { ADMIN_E2E, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { entrarAdmin } from "./helpers/auth";
import {
  abrirNavegacao,
  aguardarHidratacao,
  liberarSabadoSeNecessario,
  trocarVisao,
} from "./helpers/pagina";

async function conferirFocoNoDialogo(dialogo: Locator): Promise<void> {
  await expect
    .poll(() => dialogo.evaluate((elemento) => elemento.contains(document.activeElement)))
    .toBe(true);
}

test.describe("menu lateral", () => {
  test("abre pelo teclado, contém o foco e devolve o foco ao fechar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    const abrir = page.getByRole("button", { name: "Abrir menu", exact: true });
    const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
    await expect(abrir).toHaveAttribute("aria-haspopup", "dialog");
    await expect(abrir).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toHaveCount(0);
    await expect(page.locator('[data-indicador="inferior"]')).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("button", { name: "Gestão" })).toHaveCount(0);

    await abrir.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-modal", "true");
    // O gatilho fica fora da árvore acessível enquanto o diálogo é modal.
    const gatilho = page.locator('button[aria-label="Abrir menu"]');
    await expect(gatilho).toHaveAttribute("aria-expanded", "true");
    expect(await gatilho.getAttribute("aria-controls")).toBe(await menu.getAttribute("id"));
    await conferirFocoNoDialogo(menu);
    for (let indice = 0; indice < 12; indice++) {
      await page.keyboard.press("Tab");
      await conferirFocoNoDialogo(menu);
    }
    for (let indice = 0; indice < 3; indice++) {
      await page.keyboard.press("Shift+Tab");
      await conferirFocoNoDialogo(menu);
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(abrir).toBeFocused();
    await expect(abrir).toHaveAttribute("aria-expanded", "false");

    await abrir.click();
    await menu.getByRole("button", { name: "Fechar menu", exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(abrir).toBeFocused();

    await abrir.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(387, 422);
    await expect(menu).toBeHidden();
    await expect(abrir).toBeFocused();
  });

  test("usa as seções do desktop e fecha ao ampliar a tela para 1024 px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    let navegacao = await abrirNavegacao(page);
    const secoes = await navegacao.getByRole("button").allTextContents();
    await expect(navegacao.getByRole("button", { name: "Gestão", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();

    await page.setViewportSize({ width: 1023, height: 800 });
    navegacao = await abrirNavegacao(page);
    expect(await navegacao.getByRole("button").allTextContents()).toEqual(secoes);
    await expect(navegacao.getByRole("button", { name: "Chamada Parcial" })).toHaveCount(0);
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
    await expect(page.locator("main")).toBeFocused();
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("as ações da conta fecham o menu e abrem o próprio diálogo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await abrirNavegacao(page);
    const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
    await expect(menu.getByText(ADMIN_E2E.nome, { exact: true })).toBeVisible();
    await expect(menu.getByText("Administração", { exact: true })).toBeVisible();
    await menu.getByRole("button", { name: "Trocar senha", exact: true }).click();
    const senha = page.getByRole("dialog", { name: "Trocar minha senha", exact: true });
    await expect(menu).toBeHidden();
    await expect(senha).toBeVisible();
    await conferirFocoNoDialogo(senha);
    await page.keyboard.press("Escape");
    await expect(senha).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();

    await abrirNavegacao(page);
    await menu.getByRole("button", { name: "Configurar notificações", exact: true }).click();
    const notificacoes = page.getByRole("dialog", { name: "Notificações", exact: true });
    await expect(menu).toBeHidden();
    await expect(notificacoes).toBeVisible();
    await conferirFocoNoDialogo(notificacoes);
    await page.keyboard.press("Escape");
    await expect(notificacoes).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
    const cabecalho = page.getByRole("banner");
    await cabecalho.getByRole("button", { name: "Configurar notificações", exact: true }).click();
    await expect(notificacoes).toBeVisible();
  });

  test.describe("com rascunho da Chamada", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.beforeAll(criarMassaE2E);
    test.afterAll(limparMassaE2E);

    test("preserva as marcações e confirma antes de sair da conta", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await entrarAdmin(page);
      await trocarVisao(page, "Chamada", "chamada");
      const chamada = page.getByRole("region", { name: "Fazer chamada", exact: true });
      await liberarSabadoSeNecessario(chamada);
      const aluno = chamada.getByRole("button", {
        name: /^E2E Aluno Um(?:, turma original .*?)?:/,
      });
      await expect(aluno).toBeVisible();
      await aluno.click();
      await expect(aluno).toHaveAttribute("aria-pressed", "true");
      await trocarVisao(page, "Painel", "painel");
      const navegacao = await abrirNavegacao(page);
      await expect(
        navegacao.getByRole("button", { name: "Chamada Alterações não salvas", exact: true }),
      ).toBeVisible();
      await trocarVisao(page, "Chamada", "chamada");
      await expect(aluno).toHaveAttribute("aria-pressed", "true");

      let pedidosDeSaida = 0;
      page.on("request", (pedido) => {
        if (new URL(pedido.url()).pathname === "/api/auth/sair") pedidosDeSaida++;
      });
      const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
      await abrirNavegacao(page);
      await menu.getByRole("button", { name: "Sair da conta", exact: true }).click();
      const confirmar = page.getByRole("alertdialog", { name: "Há alterações não salvas" });
      await expect(menu).toBeHidden();
      await expect(confirmar).toBeVisible();
      await conferirFocoNoDialogo(confirmar);
      expect(pedidosDeSaida).toBe(0);
      await confirmar.getByRole("button", { name: "Continuar aqui", exact: true }).click();
      await expect(confirmar).toBeHidden();
      await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
      await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada");
      await expect(aluno).toHaveAttribute("aria-pressed", "true");

      await abrirNavegacao(page);
      await menu.getByRole("button", { name: "Sair da conta", exact: true }).click();
      await confirmar.getByRole("button", { name: "Sair mesmo assim", exact: true }).click();
      await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
      expect(pedidosDeSaida).toBe(1);
    });
  });
});

test.describe("menu da coordenação", () => {
  test.use({ storageState: "tests/e2e/.auth/coordenacao.json" });

  test("mostra as seções permitidas e as ações da conta sem Gestão", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const navegacao = await abrirNavegacao(page);
    await expect(navegacao.getByRole("button", { name: "Chamada", exact: true })).toBeVisible();
    await expect(navegacao.getByRole("button", { name: "Gestão", exact: true })).toHaveCount(0);
    await expect(navegacao.getByRole("button", { name: "Chamada Parcial" })).toHaveCount(0);
    const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
    await expect(menu.getByText("Demo", { exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Trocar senha", exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Sair da conta", exact: true })).toBeVisible();
  });
});
