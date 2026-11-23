// Massa fechada do Resumo: duas turmas para a dobra e uma segunda série para os filtros.
import type { Aluno, Frequencia, Serie, Turma } from "@/domain/frequencia";

export const MES = "2026-11";
const serie = { id: "s1", nome: "Série de Acompanhamento Tabular", ordem: 1 };
export const outraSerie = { id: "s2", nome: "Segunda série", ordem: 2 };

function turma(serie: Serie, nome: string, id: string): Turma {
  return {
    id,
    nome,
    rotulo: `${serie.nome} ${nome}`,
    serieId: serie.id,
    serieNome: serie.nome,
    horarios: [],
  };
}

export const turmaA = turma(serie, "TurmaSinteticaDeAcompanhamentoEscolarA", "a");
export const turmaB = turma(serie, "TurmaSinteticaDeAcompanhamentoEscolarB", "b");
export const turmaC = turma(outraSerie, "C", "c");

function estudantes(turmaId: string, total: number): Aluno[] {
  return Array.from({ length: total }, (_, ordem) => ({
    id: `${turmaId}${ordem}`,
    nome: `Estudante ${turmaId.toUpperCase()}${String(ordem + 1).padStart(2, "0")}`,
    turmaId,
    turmaOriginalId: turmaId,
    ordem,
    ativo: true,
  }));
}

function chamada(
  dia: string,
  turmaId: string,
  total: number,
  faltas: Frequencia["faltas"],
): Frequencia {
  return {
    dia: `${MES}-${dia}`,
    turmaId,
    revisao: 1,
    atualizadoEm: `${MES}-${dia}T14:30:00Z`,
    atualizadoPorNome: null,
    aulas: ["aula-1", "aula-2"],
    alunos: estudantes(turmaId, total).map(({ id }) => id),
    faltas,
  };
}

export function massaResumo(ampla: boolean) {
  const integral = ["aula-1", "aula-2"];
  const frequencias = [
    chamada("03", "a", 3, []),
    chamada("04", "a", 3, [
      { alunoId: "a0", horarios: integral },
      { alunoId: "a1", horarios: integral, justificativa: "SAUDE" },
    ]),
    chamada("03", "b", 2, [{ alunoId: "b0", horarios: ["aula-1"] }]),
    chamada("04", "b", 3, []),
  ];
  const series = [serie];
  const turmas = [turmaA, turmaB];
  const alunos = [...estudantes("a", 3), ...estudantes("b", 3)];
  if (ampla) {
    series.push(outraSerie);
    turmas.push(turmaC);
    const grupo = estudantes("c", 12);
    alunos.push(...grupo);
    frequencias.push(
      chamada(
        "04",
        "c",
        12,
        grupo.map(({ id }) => ({ alunoId: id, horarios: integral })),
      ),
    );
  }
  return { series, turmas, alunos, frequencias };
}
