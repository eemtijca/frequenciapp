// Contrato do relatório de saídas e entradas por período e turma.
import { LIMITE_DIAS_PERIODO, normalizar } from "./frequencia";

export const LIMITE_DIAS_RELATORIO_MOVIMENTACOES = LIMITE_DIAS_PERIODO;

export interface MovimentacaoRelatorio {
  id: string;
  tipo: "SAIDA" | "ENTRADA";
  alunoId: string;
  alunoNome: string;
  dia: string;
  horario: string | null;
  momento: string | null;
  motivo: string;
  responsavel: string | null;
}

export interface TotaisMovimentacoes {
  saidas: number;
  entradas: number;
  total: number;
}

export interface TurmaRelatorioMovimentacoes extends TotaisMovimentacoes {
  turmaId: string;
  turmaRotulo: string;
  movimentacoes: MovimentacaoRelatorio[];
}

export interface RelatorioMovimentacoes {
  de: string;
  ate: string;
  totais: TotaisMovimentacoes;
  turmas: TurmaRelatorioMovimentacoes[];
}

export type FiltroMovimentacoesPorAluno = "todas" | "repetidas";

export interface MovimentacoesDoAluno extends TotaisMovimentacoes {
  alunoId: string;
  alunoNome: string;
  turmas: string[];
  movimentacoes: MovimentacaoRelatorio[];
}

/**
 * Reagrupa o relatório por aluno, somando saídas e entradas de todas as turmas.
 * O filtro "repetidas" mantém quem tem duas ou mais movimentações e a busca
 * compara o nome sem acento nem caixa. Mais movimentações primeiro, depois o nome.
 */
export function movimentacoesPorAluno(
  turmas: TurmaRelatorioMovimentacoes[],
  filtro: FiltroMovimentacoesPorAluno = "todas",
  busca = "",
): MovimentacoesDoAluno[] {
  const porAluno = new Map<string, MovimentacoesDoAluno>();
  for (const turma of turmas) {
    for (const item of turma.movimentacoes) {
      const atual = porAluno.get(item.alunoId) ?? {
        alunoId: item.alunoId,
        alunoNome: item.alunoNome,
        turmas: [],
        saidas: 0,
        entradas: 0,
        total: 0,
        movimentacoes: [],
      };
      if (!atual.turmas.includes(turma.turmaRotulo)) atual.turmas.push(turma.turmaRotulo);
      atual.movimentacoes.push(item);
      if (item.tipo === "SAIDA") atual.saidas += 1;
      else atual.entradas += 1;
      atual.total += 1;
      porAluno.set(item.alunoId, atual);
    }
  }
  const termos = normalizar(busca).split(" ").filter(Boolean);
  return [...porAluno.values()]
    .filter((aluno) => filtro === "todas" || aluno.total >= 2)
    .filter((aluno) => {
      const alvo = normalizar(aluno.alunoNome);
      return termos.every((termo) => alvo.includes(termo));
    })
    .map((aluno) => ({
      ...aluno,
      movimentacoes: aluno.movimentacoes
        .slice()
        .sort(
          (a, b) =>
            b.dia.localeCompare(a.dia) ||
            (b.horario ?? "").localeCompare(a.horario ?? "") ||
            a.id.localeCompare(b.id),
        ),
    }))
    .sort((a, b) => b.total - a.total || a.alunoNome.localeCompare(b.alunoNome, "pt-BR"));
}
