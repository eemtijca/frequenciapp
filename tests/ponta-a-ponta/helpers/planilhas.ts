// Navega entre as ações da integração sem depender do painel aberto inicialmente.
import type { Locator } from "@playwright/test";

export async function selecionarAcaoPlanilha(
  cartao: Locator,
  acao: "Enviar" | "Editar" | "Organizar" | "Configurar",
) {
  await cartao
    .getByRole("tablist", { name: /^Ações da planilha/ })
    .getByRole("tab", { name: acao, exact: true })
    .click();
}
