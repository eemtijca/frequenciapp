// Volta às turmas de origem: escopo por série, conferência da prévia e renumeração só das turmas afetadas.
import { describe, expect, it } from "vitest";
import {
  alunosForaDaOrigem,
  conferirPrevia,
  planejarRestauracaoOrigens,
  resumoDaRestauracao,
  type AlunoParaRestauracao,
} from "@/domain/restauracao-origens";

function aluno(
  id: string,
  nome: string,
  turmaId: string,
  turmaOriginalId: string,
  ordem: number,
  ativo = true,
): AlunoParaRestauracao {
  return { id, nome, turmaId, turmaOriginalId, ordem, ativo };
}

// 3ª A e 3ª B foram remanejadas entre si; 1ª A tem uma transferência permanente para 1ª B.
// Hugo foi da 1ª A para a 3ª A e Iara da 3ª B para a 1ª B, ambos com a origem antiga.
const alunos = [
  aluno("a1", "Bruna", "3A", "3A", 1),
  aluno("a2", "Davi", "3A", "3B", 2),
  aluno("a3", "Zeca", "3A", "3A", 3, false),
  aluno("b1", "Carla", "3B", "3B", 1),
  aluno("b2", "Álvaro", "3B", "3A", 2),
  aluno("b3", "Elisa", "3B", "3A", 3),
  aluno("c1", "Fábio", "1B", "1A", 4),
  aluno("c2", "Gabi", "1A", "1A", 1),
  aluno("d1", "Hugo", "3A", "1A", 5),
  aluno("d2", "Iara", "1B", "3B", 5),
];
const terceira = new Set(["3A", "3B"]);

describe("restauração das turmas de origem", () => {
  it("considera só quem foi remanejado dentro da série, sem as transferências entre séries", () => {
    expect(alunosForaDaOrigem(alunos, terceira).map((item) => item.id)).toEqual(["a2", "b2", "b3"]);
    expect(alunosForaDaOrigem(alunos, new Set(["1A", "1B"])).map((item) => item.id)).toEqual([
      "c1",
    ]);
  });

  it("resume a prévia por turma de destino, com as turmas de onde os alunos saem", () => {
    expect(resumoDaRestauracao(alunosForaDaOrigem(alunos, terceira))).toEqual([
      { turmaId: "3B", quantidade: 1, de: ["3A"] },
      { turmaId: "3A", quantidade: 2, de: ["3B"] },
    ]);
  });

  it("devolve os alunos e renumera em ordem alfabética só as turmas afetadas", () => {
    const plano = planejarRestauracaoOrigens(alunos, terceira);
    expect(plano.movidos).toEqual([
      { id: "a2", de: "3A", para: "3B" },
      { id: "b2", de: "3B", para: "3A" },
      { id: "b3", de: "3B", para: "3A" },
    ]);
    expect(plano.turmas).toEqual(["3A", "3B"]);
    const ordem = new Map(alunos.map((item) => [item.id, item.ordem]));
    for (const mudanca of plano.ordens) {
      expect(mudanca.antes).toBe(ordem.get(mudanca.id));
      ordem.set(mudanca.id, mudanca.ordem);
    }
    // 3ª A: Álvaro, Bruna, Elisa, Hugo (fica, vindo da 1ª série) e o inativo Zeca no fim.
    expect(["b2", "a1", "b3", "d1", "a3"].map((id) => ordem.get(id))).toEqual([1, 2, 3, 4, 5]);
    // 3ª B: Carla e Davi.
    expect(["b1", "a2"].map((id) => ordem.get(id))).toEqual([1, 2]);
    // Nem a 1ª série nem quem cruzou de série entra no plano.
    const fora = new Set(["c1", "c2", "d2"]);
    expect(plano.ordens.some((mudanca) => fora.has(mudanca.id))).toBe(false);
    expect(plano.movidos.some((item) => item.id === "d1" || item.id === "d2")).toBe(false);
  });

  it("não planeja nada quando a série já está nas turmas de origem", () => {
    const plano = planejarRestauracaoOrigens(
      alunos.filter((item) => item.turmaId === item.turmaOriginalId),
      terceira,
    );
    expect(plano).toEqual({ movidos: [], ordens: [], turmas: [] });
  });

  const previa = alunosForaDaOrigem(alunos, terceira).map(({ id, turmaId, turmaOriginalId }) => ({
    id,
    turmaId,
    turmaOriginalId,
  }));

  it("aceita a prévia só quando ela confere aluno por aluno", () => {
    expect(conferirPrevia(alunos, terceira, previa)).toBe("igual");
    expect(conferirPrevia(alunos, terceira, [...previa].reverse())).toBe("igual");
    // Mesma contagem, composição diferente: Elisa voltou sozinha e Carla foi para a 3ª A.
    const depois = alunos.map((item) =>
      item.id === "b3"
        ? { ...item, turmaId: "3A" }
        : item.id === "b1"
          ? { ...item, turmaId: "3A" }
          : item,
    );
    expect(alunosForaDaOrigem(depois, terceira)).toHaveLength(previa.length);
    expect(conferirPrevia(depois, terceira, previa)).toBe("divergente");
    // Mesmos alunos com outra turma atual também divergem.
    const outraTurma = previa.map((item) => (item.id === "a2" ? { ...item, turmaId: "3C" } : item));
    expect(conferirPrevia(alunos, terceira, outraTurma)).toBe("divergente");
    expect(conferirPrevia(alunos, terceira, previa.slice(1))).toBe("divergente");
  });

  it("reconhece a repetição de uma restauração já aplicada", () => {
    const restaurados = alunos.map((item) =>
      previa.some((entrada) => entrada.id === item.id)
        ? { ...item, turmaId: item.turmaOriginalId }
        : item,
    );
    expect(conferirPrevia(restaurados, terceira, previa)).toBe("aplicada");
    // Se alguém trocou a origem de um aluno depois, não é a mesma restauração.
    const origemTrocada = restaurados.map((item) =>
      item.id === "b2" ? { ...item, turmaOriginalId: "3B" } : item,
    );
    expect(conferirPrevia(origemTrocada, terceira, previa)).toBe("divergente");
  });
});
