// Frases do painel de alerta: lê a conta em aulas, o equivalente em dias e a margem até o limite.
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";

/** Os círculos da linha contam dias; o alerta conta aulas e não decide pagamento. */
export const RODAPE_ALERTA_BENEFICIO =
  "Os contadores F e FJ da linha contam dias com falta. Este alerta conta aulas, com as chamadas salvas e a estimativa dos dias sem chamada. Não determina o pagamento do benefício.";

export interface FrasesDoAlerta {
  faltas: string;
  limite: string;
  margem: string;
  frequencia: string;
  justificadas: string | null;
  carga: string | null;
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

function diasDe(valor: number): string {
  const texto = comUmaCasa(valor);
  return `${texto} ${texto === "1" ? "dia" : "dias"}`;
}

/** Traduz a conta do benefício para as frases do painel da Chamada. */
export function frasesDoAlerta(alerta: AlertaFrequenciaBeneficio): FrasesDoAlerta {
  const referencia = alerta.aulasDeReferencia;
  const diasLetivos = alerta.diasLetivos;
  const rotuloDias = diasLetivos === 1 ? "dia letivo" : "dias letivos";
  const frequencia =
    alerta.horasLetivas > 0
      ? ((alerta.horasLetivas - alerta.aulasFaltadas) / alerta.horasLetivas) * 100
      : 0;
  const resto = alerta.limiteFaltas - alerta.aulasFaltadas;
  const aproximacaoDeFaltas =
    referencia !== null && referencia > 0
      ? ` (≈ ${diasDe(alerta.aulasFaltadas / referencia)} de ${aulas(referencia)})`
      : "";
  const aproximacaoDoLimite =
    referencia !== null && referencia > 0 ? ` (≈ ${diasDe(alerta.limiteFaltas / referencia)})` : "";
  let margem: string;
  if (resto > 0) margem = `Ainda ${resto === 1 ? "resta" : "restam"} ${aulas(resto)} até o limite.`;
  else if (resto === 0) margem = "Não resta aula até o limite.";
  else margem = `Passou do limite em ${aulas(-resto)}.`;
  let carga: string | null = null;
  if (
    referencia !== null &&
    referencia > 0 &&
    diasLetivos > 0 &&
    alerta.horasLetivas !== diasLetivos * referencia
  ) {
    carga = `Alguns dias já salvos têm outra quantidade de aulas. Por isso, ${aulas(alerta.horasLetivas)} previstas podem não ser ${diasLetivos} vezes ${aulas(referencia)}.`;
  } else if (referencia === null) {
    carga =
      "Os dias letivos não têm todos a mesma quantidade de aulas. Por isso, o total de aulas previstas pode não ser o número de dias vezes as aulas de um único dia.";
  }
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
    justificadas = `${aulas(alerta.aulasJustificadas)} com falta justificada ${tratamento} nesta conta, conforme a configuração do benefício.`;
  }
  return {
    faltas: `Faltou ${aulas(alerta.aulasFaltadas)}${aproximacaoDeFaltas} de ${aulas(alerta.horasLetivas)} previstas em ${diasLetivos} ${rotuloDias}.`,
    limite: `Limite para ${alerta.percentualMinimoFrequencia}%: ${aulas(alerta.limiteFaltas)}${aproximacaoDoLimite}.`,
    margem,
    frequencia: `Frequência projetada: ${comUmaCasa(frequencia)}%.`,
    justificadas,
    carga,
  };
}
