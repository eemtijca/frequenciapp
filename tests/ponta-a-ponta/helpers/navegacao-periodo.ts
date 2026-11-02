import { diasDoMes } from "@/domain/frequencia";

export function validarDiaCivil(dia: string): void {
  const mes = dia.slice(0, 7);
  validarMesDoSeletor(mes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !diasDoMes(mes).includes(dia)) {
    throw new Error(`Dia civil inválido: ${dia}`);
  }
}

export async function navegarMeses(
  ler: () => Promise<string>,
  mover: (direcao: -1 | 1) => Promise<void>,
  destino: string,
  passo = 1,
): Promise<void> {
  validarMesDoSeletor(destino);
  let atual = await ler();
  validarMesDoSeletor(atual);
  const diferenca = deslocamentoMes(atual, destino);
  if (!Number.isInteger(passo) || passo < 1 || diferenca % passo !== 0) {
    throw new Error(`O período ${destino} não é alcançável em passos de ${passo} meses.`);
  }
  const direcao = diferenca < 0 ? -1 : 1;
  // Exatamente a distância civil inicial: evita loop infinito sem teto arbitrário.
  const total = Math.abs(diferenca / passo);
  for (let indice = 0; indice < total; indice++) {
    await mover(direcao);
    const proximo = await ler();
    if (deslocamentoMes(atual, proximo) !== direcao * passo) {
      throw new Error(`Calendário não avançou de ${atual} para o próximo período: ${proximo}.`);
    }
    atual = proximo;
  }
}

/** Limite dos helpers que operam o seletor, não da matemática civil. */
export function validarMesDoSeletor(mes: string): void {
  deslocamentoMes(mes, mes);
  if (mes < "1000-01" || mes > "9999-11") {
    throw new Error(`Mês ${mes} fora da faixa dos helpers do seletor: 1000-01 a 9999-11.`);
  }
}

// Matemática civil da navegação de calendários dos testes E2E.
export function deslocamentoMes(origem: string, destino: string): number {
  const indice = (mes: string): number => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || mes.startsWith("0000-")) {
      throw new Error(`Mês inválido: ${mes}; esperado AAAA-MM.`);
    }
    return Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1;
  };
  return indice(destino) - indice(origem);
}
