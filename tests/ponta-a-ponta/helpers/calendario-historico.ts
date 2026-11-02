// Navega os seletores reais por rótulos acessíveis, sem selecionar dias intermediários.
import { expect, type Locator } from "@playwright/test";
import { nomeDoMes } from "@/domain/frequencia";
import { navegarMeses, validarMesDoSeletor } from "./navegacao-periodo";

async function mover(painel: Locator, grade: Locator, nome: string, alvo: string) {
  const botao = painel.getByRole("button", { name: nome, exact: true });
  if (!(await botao.isEnabled())) {
    throw new Error(`Não é possível alcançar ${alvo}: ${nome} está desabilitado pelo seletor.`);
  }
  const anterior = await grade.getAttribute("aria-label");
  await botao.click();
  await expect(grade).not.toHaveAttribute("aria-label", anterior ?? "");
}

/** Muda o mês visível; meses adjacentes podem conter dias desabilitados. */
export async function navegarCalendario(painel: Locator, destino: string): Promise<void> {
  validarMesDoSeletor(destino);
  const grade = painel.getByRole("group", { name: /^Dias de / });
  const nomes = Array.from({ length: 12 }, (_, indice) =>
    nomeDoMes(`2000-${String(indice + 1).padStart(2, "0")}`).toLowerCase(),
  );
  await navegarMeses(
    async () => {
      const rotulo = (await grade.getAttribute("aria-label")) ?? "";
      const partes = /^Dias de (\S+) de (\d{4})$/.exec(rotulo);
      const mes = nomes.indexOf((partes?.[1] ?? "").toLowerCase()) + 1;
      if (!partes?.[2] || mes === 0) throw new Error(`Mês visível inválido: ${rotulo}`);
      return `${partes[2]}-${String(mes).padStart(2, "0")}`;
    },
    async (direcao) => mover(painel, grade, direcao < 0 ? "Mês anterior" : "Mês seguinte", destino),
    destino,
  );
}

/** Seleciona o ano da grade de meses antes de escolher o mês propriamente dito. */
export async function navegarAno(painel: Locator, destino: string): Promise<void> {
  validarMesDoSeletor(destino);
  const grade = painel.getByRole("group", { name: /^Meses de / });
  await navegarMeses(
    async () => {
      const rotulo = (await grade.getAttribute("aria-label")) ?? "";
      const ano = /^Meses de (\d{1,4})$/.exec(rotulo)?.[1];
      if (!ano) throw new Error(`Ano visível inválido: ${rotulo}`);
      return `${ano.padStart(4, "0")}-01`;
    },
    async (direcao) => mover(painel, grade, direcao < 0 ? "Ano anterior" : "Ano seguinte", destino),
    `${destino.slice(0, 4)}-01`,
    12,
  );
}
