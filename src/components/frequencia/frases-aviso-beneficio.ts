// Resume o alerta mensal com percentual de frequência, faltas em aulas e margem até o limite.
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";

/** Identifica a projeção mensal sem atribuir ao alerta a decisão sobre o benefício. */
export const RODAPE_ALERTA_BENEFICIO = "Estimativa mensal. Não determina o pagamento do benefício.";

export interface FrasesDoAlerta {
  faltas: string;
  margem: string;
  frequencia: string;
  justificadas: string | null;
}

function comUmaCasa(valor: number): string {
  const arredondado = Math.round((valor + Number.EPSILON) * 10) / 10;
  return arredondado.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
}

function aulas(valor: number): string {
  return `${valor} ${valor === 1 ? "aula" : "aulas"}`;
}

/** Traduz a conta do benefício para as frases do painel da Chamada. */
export function frasesDoAlerta(alerta: AlertaFrequenciaBeneficio): FrasesDoAlerta {
  const frequencia =
    alerta.horasLetivas > 0
      ? ((alerta.horasLetivas - alerta.aulasFaltadas) / alerta.horasLetivas) * 100
      : 0;
  const resto = alerta.limiteFaltas - alerta.aulasFaltadas;
  let margem: string;
  if (resto > 0) margem = `${aulas(resto)} até o limite.`;
  else if (resto === 0) margem = "No limite de faltas.";
  else margem = `${aulas(-resto)} acima do limite.`;
  let justificadas: string | null = null;
  if (alerta.aulasJustificadas > 0) {
    const uma = alerta.aulasJustificadas === 1;
    const tratamento = alerta.faltasJustificadasContam
      ? uma
        ? "incluída"
        : "incluídas"
      : uma
        ? "desconsiderada"
        : "desconsideradas";
    justificadas = `${aulas(alerta.aulasJustificadas)} ${uma ? "justificada" : "justificadas"} ${tratamento}.`;
  }
  return {
    faltas: `Faltas: ${alerta.aulasFaltadas}/${alerta.horasLetivas} aulas · Limite: ${alerta.limiteFaltas}.`,
    margem,
    frequencia: `Frequência estimada: ${comUmaCasa(frequencia)}% · Mínimo: ${alerta.percentualMinimoFrequencia}%.`,
    justificadas,
  };
}
