// Seleciona um mês civil no seletor de período, sem pressupor ano ou mês inicial.
import { expect, type Locator, type Page } from "@playwright/test";
import { nomeDoMes } from "@/domain/frequencia";
import { navegarAno } from "./calendario-historico";
import { validarMesDoSeletor } from "./navegacao-periodo";

export async function escolherMesNoPeriodo(
  page: Page,
  escopo: Locator,
  rotulo: string,
  mes: string,
): Promise<void> {
  // Valida o destino antes de abrir o painel.
  validarMesDoSeletor(mes);
  await escopo.getByRole("button", { name: new RegExp(`^${rotulo}:`) }).click();
  const painel = page.getByRole("dialog", { name: rotulo, exact: true });
  await navegarAno(painel, mes);
  const mesesDoAno = painel.getByRole("group", {
    name: `Meses de ${mes.slice(0, 4)}`,
    exact: true,
  });
  await mesesDoAno.getByRole("button", { name: nomeDoMes(mes), exact: true }).click();
  await expect(painel).toHaveCount(0);
}
