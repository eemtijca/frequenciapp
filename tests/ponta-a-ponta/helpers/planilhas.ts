// Navega entre as ações da integração sem depender do painel aberto inicialmente.
import type { Locator } from "@playwright/test";

export async function selecionarAcaoPlanilha(
  cartao: Locator,
  acao: "Enviar" | "Editar" | "Organizar" | "Configurar",
) {
  await cartao
    .getByRole("navigation", { name: /^Ações da planilha/ })
    .getByRole("button", { name: acao, exact: true })
    .click();
}
