// Abertura da visão Provas e do cadastro de uma prova específica, compartilhada entre os specs.
import { type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

export async function abrirProvas(page: Page): Promise<void> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Provas", "provas");
}

export async function abrirNovaProva(page: Page, nome: string) {
  await abrirProvas(page);
  await page.getByRole("button", { name: "Nova prova" }).click();
  const cadastro = page.getByRole("dialog", { name: "Nova prova" });
  await cadastro.getByRole("textbox", { name: "Nome da prova" }).fill(nome);
  return cadastro;
}
