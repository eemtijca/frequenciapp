// Entrada e saída: mensagem clara para credenciais erradas e sessão válida.
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_E2E } from "./helpers/banco";
import { entrar } from "./helpers/auth";
import { aguardarHidratacao } from "./helpers/pagina";

// Sem estado de sessão: este arquivo testa a tela de entrada.
test.use({ storageState: { cookies: [], origins: [] } });

/** Sai da conta pela barra lateral no desktop ou pelo menu de perfil no celular. */
async function sairDaConta(page: Page): Promise<void> {
  const largura = page.viewportSize()?.width ?? 0;
  if (largura >= 1024) {
    await aguardarHidratacao(page, "aside button");
    await page.getByRole("button", { name: "Sair da conta" }).click();
  } else {
    await aguardarHidratacao(page, `button[aria-label="Conta de ${ADMIN_E2E.nome}"]`);
    await page.getByRole("button", { name: `Conta de ${ADMIN_E2E.nome}` }).click();
    await page.getByRole("button", { name: "Sair da conta" }).click();
  }
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible({ timeout: 25_000 });
}

test.describe("autenticação", () => {
  test("recusa credenciais erradas com mensagem clara", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByLabel("E-mail").fill(ADMIN_E2E.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("entra na frequência e sai da conta", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByLabel("E-mail").fill(ADMIN_E2E.email);
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_E2E.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await sairDaConta(page);
  });

  test("mantém a sessão e o e-mail quando pede para lembrar", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    const manter = page.getByRole("checkbox", { name: /Manter conectado neste dispositivo/ });
    await expect(manter).toBeChecked();
    await page.getByLabel("E-mail").fill(ADMIN_E2E.email);
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_E2E.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

    const salvo = await page.evaluate(() => window.localStorage.getItem("frequenciapp:email"));
    expect(salvo).toBe(ADMIN_E2E.email);
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === "frequenciapp_sessao",
    );
    expect(cookie?.expires ?? 0).toBeGreaterThan(0);

    // Ao sair e voltar, o e-mail lembrado já vem preenchido.
    await sairDaConta(page);
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByLabel("E-mail")).toHaveValue(ADMIN_E2E.email);
  });

  test("sem lembrar, usa cookie de sessão e esquece o e-mail", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("checkbox", { name: /Manter conectado/ }).uncheck();
    await page.getByLabel("E-mail").fill(ADMIN_E2E.email);
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_E2E.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

    const salvo = await page.evaluate(() => window.localStorage.getItem("frequenciapp:email"));
    expect(salvo).toBeNull();
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === "frequenciapp_sessao",
    );
    expect(cookie?.expires).toBe(-1);
  });

  test("campos de senha mostram e ocultam", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    const senha = page.locator("#senha");
    await expect(senha).toHaveAttribute("type", "password");
    await senha.fill("segredo-visivel");
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(senha).toHaveAttribute("type", "text");
    await expect(senha).toHaveValue("segredo-visivel");
    await page.getByRole("button", { name: "Ocultar senha" }).click();
    await expect(senha).toHaveAttribute("type", "password");

    // Na troca de senha, os três campos também alternam.
    await entrar(page, ADMIN_E2E.email, ADMIN_E2E.senha);
    const largura = page.viewportSize()?.width ?? 0;
    if (largura >= 1024) {
      await aguardarHidratacao(page, "aside button");
      await page.getByRole("button", { name: "Trocar senha" }).click();
    } else {
      await aguardarHidratacao(page, `button[aria-label="Conta de ${ADMIN_E2E.nome}"]`);
      await page.getByRole("button", { name: `Conta de ${ADMIN_E2E.nome}` }).click();
      await page.getByRole("button", { name: "Trocar minha senha" }).click();
    }
    for (const id of ["senha-atual", "senha-nova", "senha-confirmacao"]) {
      const campo = page.locator(`#${id}`);
      await expect(campo).toHaveAttribute("type", "password");
      await campo.locator("xpath=..").getByRole("button", { name: "Mostrar senha" }).click();
      await expect(campo).toHaveAttribute("type", "text");
    }
  });
});
