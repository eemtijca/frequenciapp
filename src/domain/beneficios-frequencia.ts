// Alerta de frequência dos benefícios: faltas do mês acima do que o percentual mínimo de cada benefício permite.
// Regras puras: o percentual vem da configuração do benefício, o limite das aulas do mês e as faltas são contadas por aula.
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import {
  alunoDesistenteNoDia,
  diaDaSemanaIso,
  diasDoMes,
  horariosDaChamada,
  horariosDoDia,
  type Aluno,
  type Horario,
} from "@/domain/frequencia";

/** Faixa aceita para o percentual mínimo de frequência de um benefício. */
export const PERCENTUAL_MINIMO_MENOR = 1;
export const PERCENTUAL_MINIMO_MAIOR = 100;
export const AULAS_POR_DIA_MAXIMO = 30;

/** Regra de frequência mínima de um benefício, como a administração a configura. */
export interface RegraFrequenciaBeneficio {
  id: string;
  nome: string;
  /** Percentual mínimo das horas letivas do mês em que o aluno precisa estar presente. */
  percentualMinimoFrequencia: number;
  /** Quantidade usada na projeção; nulo segue a grade. Retratos salvos são preservados. */
  aulasPorDia: number | null;
  /** Quando falso, só as faltas sem justificativa entram na conta. */
  faltasJustificadasContam: boolean;
  ativo: boolean;
}

/** Máximo de aulas de falta no mês sem cair abaixo do percentual mínimo de frequência. */
export function limiteDeFaltas(horasLetivas: number, percentualMinimoFrequencia: number): number {
  if (horasLetivas <= 0) return 0;
  return Math.floor((horasLetivas * (100 - percentualMinimoFrequencia)) / 100);
}

/** Verdadeiro quando as faltas passam do limite: exatamente o percentual mínimo ainda é permitido. */
export function acimaDoLimiteDeFaltas(
  aulasFaltadas: number,
  horasLetivas: number,
  percentualMinimoFrequencia: number,
): boolean {
  return (
    horasLetivas > 0 && aulasFaltadas > limiteDeFaltas(horasLetivas, percentualMinimoFrequencia)
  );
}

/** Chamada salva no mês: as aulas do retrato e os alunos que constavam nela. */
export interface ChamadaDoMes {
  dia: string;
  turmaId: string;
  aulas: number;
  alunoIds: string[];
}

/** Falta de um aluno em uma aula, com a marca de justificada. */
export interface FaltaDoMes {
  alunoId: string;
  justificada: boolean;
}

export interface EntradaAlertasFrequencia {
  /** Mês no formato AAAA-MM. */
  mes: string;
  alunos: Aluno[];
  turmas: { id: string; horarios: Horario[] }[];
  feriados: Feriado[];
  chamadas: ChamadaDoMes[];
  faltas: FaltaDoMes[];
  /** Regras configuradas; as inativas são ignoradas. */
  regras: RegraFrequenciaBeneficio[];
}

/** Aluno com faltas acima do limite do mês segundo a regra de um benefício. */
export interface AlertaFrequenciaBeneficio {
  beneficioId: string;
  beneficioNome: string;
  percentualMinimoFrequencia: number;
  faltasJustificadasContam: boolean;
  alunoId: string;
  aulasPorDia: number | null;
  /** Aulas de falta que contam contra o limite, conforme a regra do benefício. */
  aulasFaltadas: number;
  /** Aulas de falta com justificativa no mês, contadas ou não pela regra. */
  aulasJustificadas: number;
  /** Aulas do mês: retratos salvos mais a projeção pela carga configurada ou pela grade. */
  horasLetivas: number;
  limiteFaltas: number;
}

/**
 * Horas letivas do aluno no mês. Dias com chamada salva usam o retrato das aulas
 * (zero quando o aluno não constava nela). Sem retrato de aulas, a grade da
 * turma da chamada serve de estimativa; dias sem chamada usam a turma atual.
 */
function horasLetivasDoAluno(
  aluno: Aluno,
  dias: string[],
  entrada: EntradaAlertasFrequencia,
  aulasPorAlunoDia: Map<string, { salvas: number; previstas: number }[]>,
  turmasComChamada: Set<string>,
  aulasPorDia: number | null,
): number {
  const grade = entrada.turmas.find((turma) => turma.id === aluno.turmaId)?.horarios ?? [];
  let horas = 0;
  for (const dia of dias) {
    const registradas = aulasPorAlunoDia.get(`${aluno.id}|${dia}`);
    if (registradas !== undefined) {
      horas += registradas.reduce(
        (total, aulas) => total + (aulas.salvas || aulasPorDia || aulas.previstas),
        0,
      );
      continue;
    }
    if (turmasComChamada.has(`${aluno.turmaId}|${dia}`)) continue;
    if (diaDaSemanaIso(dia) > 5) continue;
    if (feriadoNaData(entrada.feriados, dia) || alunoDesistenteNoDia(aluno, dia)) continue;
    const previstas = horariosDoDia(grade, dia).length;
    if (previstas > 0) horas += aulasPorDia ?? previstas;
  }
  return horas;
}

/**
 * Alunos ativos cujas faltas do mês já passam do limite da regra de algum
 * benefício ativo. Um aluno pode aparecer uma vez por benefício.
 */
export function alertasDeFrequencia(
  entrada: EntradaAlertasFrequencia,
): AlertaFrequenciaBeneficio[] {
  const regras = entrada.regras.filter((regra) => regra.ativo);
  if (regras.length === 0) return [];
  const dias = diasDoMes(entrada.mes);
  const aulasPorAlunoDia = new Map<string, { salvas: number; previstas: number }[]>();
  const turmasComChamada = new Set<string>();
  const grades = new Map(entrada.turmas.map((turma) => [turma.id, turma.horarios]));
  for (const chamada of entrada.chamadas) {
    turmasComChamada.add(`${chamada.turmaId}|${chamada.dia}`);
    // Retrato vazio indica chamada antiga. Como no restante da Chamada, a
    // estimativa usa a carga configurada ou a grade, inclusive no sábado já registrado.
    const aulas = {
      salvas: chamada.aulas,
      previstas: horariosDaChamada(grades.get(chamada.turmaId) ?? [], chamada.dia, true).length,
    };
    for (const alunoId of chamada.alunoIds) {
      const chave = `${alunoId}|${chamada.dia}`;
      const registradas = aulasPorAlunoDia.get(chave) ?? [];
      registradas.push(aulas);
      aulasPorAlunoDia.set(chave, registradas);
    }
  }
  const faltasPorAluno = new Map<string, { simples: number; justificadas: number }>();
  for (const falta of entrada.faltas) {
    const atual = faltasPorAluno.get(falta.alunoId) ?? { simples: 0, justificadas: 0 };
    if (falta.justificada) atual.justificadas += 1;
    else atual.simples += 1;
    faltasPorAluno.set(falta.alunoId, atual);
  }
  const alertas: AlertaFrequenciaBeneficio[] = [];
  for (const aluno of entrada.alunos) {
    const faltas = faltasPorAluno.get(aluno.id);
    if (!aluno.ativo || !faltas) continue;
    for (const regra of regras) {
      const horasLetivas = horasLetivasDoAluno(
        aluno,
        dias,
        entrada,
        aulasPorAlunoDia,
        turmasComChamada,
        regra.aulasPorDia,
      );
      const aulasFaltadas =
        faltas.simples + (regra.faltasJustificadasContam ? faltas.justificadas : 0);
      if (!acimaDoLimiteDeFaltas(aulasFaltadas, horasLetivas, regra.percentualMinimoFrequencia)) {
        continue;
      }
      alertas.push({
        beneficioId: regra.id,
        beneficioNome: regra.nome,
        percentualMinimoFrequencia: regra.percentualMinimoFrequencia,
        faltasJustificadasContam: regra.faltasJustificadasContam,
        alunoId: aluno.id,
        aulasPorDia: regra.aulasPorDia,
        aulasFaltadas,
        aulasJustificadas: faltas.justificadas,
        horasLetivas,
        limiteFaltas: limiteDeFaltas(horasLetivas, regra.percentualMinimoFrequencia),
      });
    }
  }
  return alertas;
}
