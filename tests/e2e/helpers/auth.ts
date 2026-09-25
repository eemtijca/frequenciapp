// Helpers de autenticação para os testes de ponta a ponta.
import { expect, type Page } from "@playwright/test";
import { ADMIN_E2E, COORD_E2E } from "./banco";
import { aguardarHidratacao } from "./pagina";

/** Preenche a tela de entrada e aguarda a visão inicial do Painel. */
export async function entrar(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
}

export function entrarAdmin(page: Page): Promise<void> {
  return entrar(page, ADMIN_E2E.email, ADMIN_E2E.senha);
}

export function entrarCoordenacao(page: Page): Promise<void> {
  return entrar(page, COORD_E2E.email, COORD_E2E.senha);
}
