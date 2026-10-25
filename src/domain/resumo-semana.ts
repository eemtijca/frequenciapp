// Resumo somente leitura da semana letiva que se encerra no domingo.
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import {
  alunoDesistenteNoDia,
  diaSeguinte,
  ehDomingo,
  horariosDoDia,
  MOMENTOS_SAIDA,
  type Aluno,
  type Frequencia,
  type SaidaAntecipada,
  type Turma,
} from "@/domain/frequencia";
import { alunosPorFaltas, contagemDeMarcas, marcasDoDia } from "@/domain/relatorios";

/** Segunda a sábado imediatamente anteriores, quando o dia é domingo. */
export function semanaEncerrada(dia: string): string[] | null {
  if (!ehDomingo(dia)) return null;
  const segunda = diaSeguinte(dia, -6);
  return [0, 1, 2, 3, 4, 5].map((deslocamento) => diaSeguinte(segunda, deslocamento));
}

export interface DiaNoResumoSemana {
  dia: string;
  feriado: string | null;
  previsto: boolean;
  salva: boolean;
  faltas: number;
  justificadas: number;
  presentes: number;
  parciais: number;
  saidas: number;
}

export interface AlunoNoResumoSemana {
  alunoId: string;
  nome: string;
  faltas: number;
  justificadas: number;
}

export interface SaidaNoResumoSemana {
  id: string;
  alunoId: string;
  nome: string;
  dia: string;
  horario: string | null;
  momento: string;
}

export interface ResumoSemanaTurma {
  turmaId: string;
  rotulo: string;
  dias: DiaNoResumoSemana[];
  pendencias: string[];
  chamadasSalvas: string[];
  alunos: AlunoNoResumoSemana[];
  saidas: SaidaNoResumoSemana[];
  totais: { faltas: number; justificadas: number; presentes: number };
}

function rotuloMomento(codigo: string): string {
  return MOMENTOS_SAIDA.find((momento) => momento.codigo === codigo)?.rotulo ?? codigo;
}

/**
 * Conta a semana de uma turma com as mesmas marcas da chamada: F, FJ, presença
 * e saída parcial. Dia letivo é feriado excluído, com aula prevista e aluno
 * ativo. Sábado sem aula só entra quando já há chamada salva. Pendência é dia
 * letivo sem chamada.
 */
export function resumirSemanaDaTurma(
  turma: Turma,
  alunos: Aluno[],
  dias: readonly string[],
  frequencias: readonly Frequencia[],
  saidas: readonly SaidaAntecipada[],
  feriados: readonly Feriado[],
): ResumoSemanaTurma {
  const frequenciasDaTurma = frequencias.filter(
    (frequencia) => frequencia.turmaId === turma.id && dias.includes(frequencia.dia),
  );
  const idsNaLista = new Set(frequenciasDaTurma.flatMap((frequencia) => frequencia.alunos ?? []));
  const alunosDaTurma = alunos.filter(
    (aluno) => aluno.ativo && (aluno.turmaId === turma.id || idsNaLista.has(aluno.id)),
  );
  const idsDaTurma = new Set(
    alunos.filter((aluno) => aluno.turmaId === turma.id).map((aluno) => aluno.id),
  );
  const nomes = new Map(alunos.map((aluno) => [aluno.id, aluno.nome]));
  const saidasDaTurma = saidas
    .filter((saida) => dias.includes(saida.dia) && idsDaTurma.has(saida.alunoId))
    .slice()
    .sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        (nomes.get(a.alunoId) ?? "").localeCompare(nomes.get(b.alunoId) ?? "", "pt-BR") ||
        a.id.localeCompare(b.id),
    );

  const diasResumo = dias.map((dia) => {
    const feriado = feriadoNaData(feriados, dia)?.nome ?? null;
    const ativos = alunos.filter(
      (aluno) => aluno.ativo && aluno.turmaId === turma.id && !alunoDesistenteNoDia(aluno, dia),
    );
    const doDia = frequenciasDaTurma.filter((frequencia) => frequencia.dia === dia);
    const salva = doDia.length > 0;
    const previsto =
      feriado === null && horariosDoDia(turma.horarios, dia).length > 0 && ativos.length > 0;
    const idsLista = new Set(doDia.flatMap((frequencia) => frequencia.alunos ?? []));
    const alunosDoDia =
      idsLista.size > 0 ? alunos.filter((aluno) => idsLista.has(aluno.id)) : ativos;
    const contagem = salva
      ? contagemDeMarcas(marcasDoDia(alunosDoDia, dia, doDia, turma.horarios), alunosDoDia.length)
      : null;
    return {
      dia,
      feriado,
      previsto,
      salva,
      faltas: contagem?.faltas ?? 0,
      justificadas: contagem?.justificadas ?? 0,
      presentes: contagem?.presentes ?? 0,
      parciais: contagem?.parciais ?? 0,
      saidas: saidasDaTurma.filter((saida) => saida.dia === dia).length,
    };
  });

  const ranking = alunosPorFaltas(alunosDaTurma, [turma], [...frequenciasDaTurma], [...dias]);

  return {
    turmaId: turma.id,
    rotulo: turma.rotulo,
    dias: diasResumo,
    pendencias: diasResumo.filter((dia) => dia.previsto && !dia.salva).map((dia) => dia.dia),
    chamadasSalvas: diasResumo.filter((dia) => dia.salva).map((dia) => dia.dia),
    alunos: ranking.map((item) => ({
      alunoId: item.aluno.id,
      nome: item.aluno.nome,
      faltas: item.faltas,
      justificadas: item.justificadas,
    })),
    saidas: saidasDaTurma.map((saida) => ({
      id: saida.id,
      alunoId: saida.alunoId,
      nome: nomes.get(saida.alunoId) ?? "Aluno",
      dia: saida.dia,
      horario: saida.horario,
      momento: rotuloMomento(saida.momento),
    })),
    totais: {
      faltas: diasResumo.reduce((soma, dia) => soma + dia.faltas, 0),
      justificadas: diasResumo.reduce((soma, dia) => soma + dia.justificadas, 0),
      presentes: diasResumo.reduce((soma, dia) => soma + dia.presentes, 0),
    },
  };
}
