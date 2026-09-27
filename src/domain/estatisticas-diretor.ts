// Estatísticas da turma de origem para o diretor de turma: taxa de ausência
// por aluno e por semana, com o denominador nos dias com chamada registrada.
// Regras puras sobre a grade (montarGrade), sem dado de outras turmas.
import { diaDaSemanaIso, diaSeguinte, type LinhaGrade } from "@/domain/frequencia";
import type { CategoriaDiretor } from "@/domain/diretores";

export interface EstatisticaAluno {
  alunoId: string;
  nome: string;
  /** Dias com falta, justificada ou não (F + FJ). */
  ausencias: number;
  /** Só quando as justificativas estão liberadas ao diretor. */
  faltas: number | null;
  justificadas: number | null;
  /** Saídas antecipadas no período, só quando liberadas. */
  saidas: number | null;
  /** Dias em que a turma atual do aluno teve chamada registrada. */
  diasComChamada: number;
  /** Ausências sobre dias com chamada, de 0 a 1. */
  taxa: number;
  emRisco: boolean;
}

export interface EstatisticaSemana {
  /** Segunda-feira da semana, AAAA-MM-DD. */
  inicio: string;
  ausencias: number;
  faltas: number | null;
  justificadas: number | null;
  /** Soma, por aluno, dos dias com chamada na semana. */
  alunoDias: number;
  taxa: number;
}

export interface EstatisticasTurma {
  alunos: EstatisticaAluno[];
  semanas: EstatisticaSemana[];
  resumo: {
    alunos: number;
    emRisco: number;
    ausencias: number;
    alunoDias: number;
    taxa: number;
  };
  limiteRisco: number;
  categorias: CategoriaDiretor[];
}

/** Segunda-feira da semana ISO do dia civil. */
export function inicioDaSemana(dia: string): string {
  return diaSeguinte(dia, 1 - diaDaSemanaIso(dia));
}

function razao(parte: number, todo: number): number {
  return todo > 0 ? parte / todo : 0;
}

/**
 * Agrega a grade da turma de origem. O aluno está em risco quando a taxa de
 * ausência alcança o limite (percentual) dos parâmetros. Sem liberação das
 * justificativas, só o total de ausências sai; a separação F e FJ fica nula.
 */
export function estatisticasDaGrade(
  grade: { dias: string[]; linhas: LinhaGrade[] },
  opcoes: {
    limiteRiscoPercentual: number;
    categorias: readonly CategoriaDiretor[];
    saidasPorAluno?: ReadonlyMap<string, number>;
  },
): EstatisticasTurma {
  const verJustificadas = opcoes.categorias.includes("justificativas");
  const verSaidas = opcoes.categorias.includes("saidas");
  const limite = opcoes.limiteRiscoPercentual / 100;

  const alunos: EstatisticaAluno[] = grade.linhas.map((linha) => {
    const ausencias = linha.faltas + linha.justificadas;
    const taxa = razao(ausencias, linha.frequencias);
    return {
      alunoId: linha.aluno.id,
      nome: linha.aluno.nome,
      ausencias,
      faltas: verJustificadas ? linha.faltas : null,
      justificadas: verJustificadas ? linha.justificadas : null,
      saidas: verSaidas ? (opcoes.saidasPorAluno?.get(linha.aluno.id) ?? 0) : null,
      diasComChamada: linha.frequencias,
      taxa,
      emRisco: linha.frequencias > 0 && taxa >= limite,
    };
  });

  const porSemana = new Map<
    string,
    { ausencias: number; faltas: number; justificadas: number; alunoDias: number }
  >();
  for (const dia of grade.dias) {
    const chave = inicioDaSemana(dia);
    const semana = porSemana.get(chave) ?? {
      ausencias: 0,
      faltas: 0,
      justificadas: 0,
      alunoDias: 0,
    };
    for (const linha of grade.linhas) {
      const marca = linha.marcas[dia];
      if (marca === undefined) continue;
      semana.alunoDias += 1;
      if (marca === "F") {
        semana.faltas += 1;
        semana.ausencias += 1;
      } else if (marca === "FJ") {
        semana.justificadas += 1;
        semana.ausencias += 1;
      }
    }
    porSemana.set(chave, semana);
  }
  const semanas: EstatisticaSemana[] = [...porSemana.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inicio, semana]) => ({
      inicio,
      ausencias: semana.ausencias,
      faltas: verJustificadas ? semana.faltas : null,
      justificadas: verJustificadas ? semana.justificadas : null,
      alunoDias: semana.alunoDias,
      taxa: razao(semana.ausencias, semana.alunoDias),
    }));

  const ausencias = alunos.reduce((soma, aluno) => soma + aluno.ausencias, 0);
  const alunoDias = alunos.reduce((soma, aluno) => soma + aluno.diasComChamada, 0);
  return {
    alunos: alunos.sort((a, b) => b.taxa - a.taxa || a.nome.localeCompare(b.nome, "pt-BR")),
    semanas,
    resumo: {
      alunos: alunos.length,
      emRisco: alunos.filter((aluno) => aluno.emRisco).length,
      ausencias,
      alunoDias,
      taxa: razao(ausencias, alunoDias),
    },
    limiteRisco: opcoes.limiteRiscoPercentual,
    categorias: [...opcoes.categorias],
  };
}

export interface TurmaDoDiretor {
  turmaId: string;
  turma: string;
  inicio: string;
  fim: string | null;
}

export interface ContextoDiretor {
  trocaObrigatoria: boolean;
  turmas: TurmaDoDiretor[];
  categorias: CategoriaDiretor[];
  limiteRiscoPercentual: number;
  diaCorrente: string;
}

export interface EstatisticasDoDiretor {
  turmaId: string;
  turma: string;
  /** Período consultado depois do recorte ao vínculo; nulo sem interseção. */
  periodo: { de: string; ate: string } | null;
  vinculo: { inicio: string; fim: string | null };
  estatisticas: EstatisticasTurma | null;
}
