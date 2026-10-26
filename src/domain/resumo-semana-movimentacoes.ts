// Agregação semanal de saídas ou entradas por aba, dia, turma e aluno.
import type { EntradaAtrasada } from "@/domain/entradas";
import type { Aluno, SaidaAntecipada, Turma } from "@/domain/frequencia";

export type TipoMovimentacaoSemana = "saida" | "entrada";

export interface DiaNoResumoSemanaMovimentacoes {
  dia: string;
  total: number;
}

export interface TurmaNoResumoSemanaMovimentacoes {
  turmaId: string;
  rotulo: string;
  total: number;
}

export interface AlunoNoResumoSemanaMovimentacoes {
  alunoId: string;
  nome: string;
  turma: string;
  total: number;
}

export interface ResumoSemanaMovimentacoes {
  tipo: TipoMovimentacaoSemana;
  dias: DiaNoResumoSemanaMovimentacoes[];
  turmas: TurmaNoResumoSemanaMovimentacoes[];
  alunos: AlunoNoResumoSemanaMovimentacoes[];
  total: number;
  totalAlunos: number;
  totalTurmas: number;
}

interface MovimentoAgregado {
  id: string;
  alunoId: string;
  nome: string;
  turmaId: string;
  turmaRotulo: string;
  dia: string;
}

function movimentosDeSaidas(
  saidas: readonly SaidaAntecipada[],
  alunos: readonly Aluno[],
  turmas: readonly Turma[],
  dias: readonly string[],
): MovimentoAgregado[] {
  const alunosPorId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
  const turmasPorId = new Map(turmas.map((turma) => [turma.id, turma]));
  return saidas.flatMap((saida) => {
    if (!dias.includes(saida.dia)) return [];
    const aluno = alunosPorId.get(saida.alunoId);
    if (!aluno) return [];
    // A saída não guarda a turma da época: vale a turma atual do aluno.
    const turmaId = aluno.turmaId;
    const turma = turmasPorId.get(turmaId);
    return [
      {
        id: `saida:${saida.id}`,
        alunoId: aluno.id,
        nome: aluno.nome,
        turmaId,
        turmaRotulo: turma?.rotulo ?? "Sem turma",
        dia: saida.dia,
      },
    ];
  });
}

function movimentosDeEntradas(
  entradas: readonly EntradaAtrasada[],
  dias: readonly string[],
): MovimentoAgregado[] {
  return entradas.flatMap((entrada) =>
    dias.includes(entrada.dia)
      ? [
          {
            id: `entrada:${entrada.id}`,
            alunoId: entrada.alunoId,
            nome: entrada.nome,
            turmaId: entrada.turmaId,
            turmaRotulo: entrada.turmaRotulo,
            dia: entrada.dia,
          },
        ]
      : [],
  );
}

function agregar(
  tipo: TipoMovimentacaoSemana,
  movimentos: MovimentoAgregado[],
  dias: readonly string[],
): ResumoSemanaMovimentacoes {
  const porDia = new Map(dias.map((dia) => [dia, 0]));
  const porTurma = new Map<string, TurmaNoResumoSemanaMovimentacoes>();
  const porAluno = new Map<string, AlunoNoResumoSemanaMovimentacoes>();
  for (const movimento of movimentos) {
    porDia.set(movimento.dia, (porDia.get(movimento.dia) ?? 0) + 1);
    const turma = porTurma.get(movimento.turmaId) ?? {
      turmaId: movimento.turmaId,
      rotulo: movimento.turmaRotulo,
      total: 0,
    };
    turma.total += 1;
    porTurma.set(movimento.turmaId, turma);
    const aluno = porAluno.get(movimento.alunoId) ?? {
      alunoId: movimento.alunoId,
      nome: movimento.nome,
      turma: movimento.turmaRotulo,
      total: 0,
    };
    aluno.total += 1;
    porAluno.set(movimento.alunoId, aluno);
  }
  return {
    tipo,
    dias: [...porDia.entries()].map(([dia, total]) => ({ dia, total })),
    turmas: [...porTurma.values()].sort(
      (a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
    ),
    alunos: [...porAluno.values()].sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
    ),
    total: movimentos.length,
    totalAlunos: porAluno.size,
    totalTurmas: porTurma.size,
  };
}

export function resumirMovimentacoes(
  tipo: "saida",
  dados: {
    saidas: readonly SaidaAntecipada[];
    alunos: readonly Aluno[];
    turmas: readonly Turma[];
    dias: readonly string[];
  },
): ResumoSemanaMovimentacoes;
export function resumirMovimentacoes(
  tipo: "entrada",
  dados: {
    entradas: readonly EntradaAtrasada[];
    dias: readonly string[];
  },
): ResumoSemanaMovimentacoes;
export function resumirMovimentacoes(
  tipo: TipoMovimentacaoSemana,
  dados:
    | {
        saidas: readonly SaidaAntecipada[];
        alunos: readonly Aluno[];
        turmas: readonly Turma[];
        dias: readonly string[];
      }
    | {
        entradas: readonly EntradaAtrasada[];
        dias: readonly string[];
      },
): ResumoSemanaMovimentacoes {
  if (tipo === "saida") {
    const deSaidas = dados as {
      saidas: readonly SaidaAntecipada[];
      alunos: readonly Aluno[];
      turmas: readonly Turma[];
      dias: readonly string[];
    };
    return agregar(
      "saida",
      movimentosDeSaidas(deSaidas.saidas, deSaidas.alunos, deSaidas.turmas, deSaidas.dias),
      deSaidas.dias,
    );
  }
  const deEntradas = dados as {
    entradas: readonly EntradaAtrasada[];
    dias: readonly string[];
  };
  return agregar(
    "entrada",
    movimentosDeEntradas(deEntradas.entradas, deEntradas.dias),
    deEntradas.dias,
  );
}
