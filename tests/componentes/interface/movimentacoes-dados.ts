// Dados sintéticos compartilhados pela interface e pelo dublê HTTP.
import type { EntradaAtrasada } from "@/domain/entradas";
import type { SaidaAntecipada } from "@/domain/frequencia";

export const NOME = `Aluno Sintético de Atividades Interdisciplinares ${"W".repeat(44)}`;
export const TURMA = "Série Sintética Interdisciplinar de Estudos e Projetos da Escola Modelo B";
export const RESPONSAVEL = "Responsável Sintético";
export const DIA = "2026-11-19";
const MOMENTO = "aula_2";
export const SAIDAS: SaidaAntecipada[] = Array.from({ length: 12 }, (_, i) => ({
  id: `saida-${i}`,
  alunoId: i === 0 ? "aluno-longo" : `historico-${i}`,
  dia: DIA,
  turmaHistoricaNome: i === 0 ? "Turma histórica sintética" : null,
  momento: MOMENTO,
  horario: "09:10",
  justificativa: null,
  observacao: null,
  texto: "Motivo registrado na saída",
  liberadoPorId: null,
  liberadoPorCodigo: "teste",
  liberadoPorNome: RESPONSAVEL,
  criadoEm: "2026-11-19T12:10:00Z",
}));
export const ENTRADAS: EntradaAtrasada[] = Array.from({ length: 12 }, (_, i) => ({
  id: `entrada-${i}`,
  alunoId: i === 0 ? "aluno-longo" : `historico-${i}`,
  nome: i === 0 ? NOME : `Aluno de histórico ${i}`,
  turmaId: "turma-b",
  turmaRotulo: "Turma registrada na entrada",
  dia: DIA,
  horario: "07:10",
  momento: MOMENTO,
  motivo: "Motivo registrado na entrada",
  registradoPorNome: "Autor sintético",
  responsavelRegistroNome: RESPONSAVEL,
  criadoEm: "2026-11-19T10:10:00Z",
}));
