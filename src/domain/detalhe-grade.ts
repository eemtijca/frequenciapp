// Textos da Grade: proporção da presença parcial, aula e justificativa.
import {
  diaDaSemanaIso,
  rotuloData,
  rotuloJustificativa,
  type AulaFaltada,
  type DetalheDoDia,
  type Horario,
  type Justificativa,
  type ProporcaoAulas,
  JUSTIFICATIVAS_PADRAO,
} from "@/domain/frequencia";

/** Proporção curta da célula, como 2/5. */
export function textoProporcao(proporcao: ProporcaoAulas): string {
  return `${proporcao.faltadas}/${proporcao.previstas}`;
}

/** Descrição da proporção para leitor de tela. */
export function descricaoDaProporcao(nome: string, dia: string, proporcao: ProporcaoAulas): string {
  return `${nome} presente em parte das aulas em ${dia}, ${proporcao.faltadas} de ${proporcao.previstas} aulas`;
}

/** Rótulo da aula faltada. Sem horário conhecido, não expõe o identificador. */
export function rotuloDaAula(horario: Horario | undefined, dia: string): string {
  if (!horario) return "Aula fora da grade atual";
  const disciplina = horario.disciplinas?.[String(diaDaSemanaIso(dia))]?.trim();
  const faixa = `${horario.ordem}ª aula, ${horario.inicio}-${horario.fim}`;
  return disciplina ? `${faixa}, ${disciplina}` : faixa;
}

/** Justificativa visível. Código desconhecido permanece legível, sem inventar rótulo. */
export function textoDaJustificativa(
  aula: AulaFaltada,
  catalogo: readonly Justificativa[] = JUSTIFICATIVAS_PADRAO,
): string {
  if (!aula.justificativa) return "Sem justificativa";
  const rotulo = rotuloJustificativa(aula.justificativa, catalogo);
  const motivo = rotulo !== "" ? rotulo : aula.justificativa;
  return aula.observacao ? `${motivo} (${aula.observacao})` : motivo;
}

/** Uma linha do detalhe: data, aula e justificativa. */
export function linhaDoDetalhe(
  detalhe: DetalheDoDia,
  aula: AulaFaltada,
  horarios: readonly Horario[],
  catalogo: readonly Justificativa[] = JUSTIFICATIVAS_PADRAO,
): string {
  const horario = horarios.find((item) => item.id === aula.horarioId);
  const marca = detalhe.proporcao ? textoProporcao(detalhe.proporcao) : detalhe.marca;
  return `${rotuloData(detalhe.dia)} ${marca}: ${rotuloDaAula(horario, detalhe.dia)}; ${textoDaJustificativa(aula, catalogo)}`;
}
