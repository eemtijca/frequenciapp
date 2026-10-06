// Contrato do relatório de saídas e entradas por período e turma.
import { LIMITE_DIAS_PERIODO } from "./frequencia";

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
