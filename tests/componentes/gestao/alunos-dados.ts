// Alunos e turmas fictícios para exercitar nomes e rótulos no limite da interface.
import type { Aluno, Turma } from "@/domain/frequencia";

const prefixo = "TurmaSinteticaComMesmoPrefixo".repeat(2);
export const rotuloA = `${prefixo}A`;
export const rotuloB = `${prefixo}B`;
export const rotuloC = `${prefixo}C`;
export const nomeLongo = "AlunaSinteticaSemEspacos".repeat(5).slice(0, 100);
export const turmas: Turma[] = [
  { id: "a", serieId: "s", nome: "A", rotulo: rotuloA, serieNome: "Série teste", horarios: [] },
  { id: "b", serieId: "s", nome: "B", rotulo: rotuloB, serieNome: "Série teste", horarios: [] },
  { id: "c", serieId: "s", nome: "C", rotulo: rotuloC, serieNome: "Série teste", horarios: [] },
];
export const alunos: Aluno[] = [
  { id: "longo", nome: nomeLongo, turmaId: "a", turmaOriginalId: "b", ordem: 1, ativo: true },
  { id: "bia", nome: "Bia Teste", turmaId: "a", turmaOriginalId: "a", ordem: 2, ativo: false },
  {
    id: "rui",
    nome: "Rui Teste",
    turmaId: "b",
    turmaOriginalId: "b",
    ordem: 1,
    ativo: true,
    desistenteEm: "2026-01-01",
  },
  { id: "alvaro", nome: "Álvaro Teste", turmaId: "b", turmaOriginalId: "a", ordem: 2, ativo: true },
];
