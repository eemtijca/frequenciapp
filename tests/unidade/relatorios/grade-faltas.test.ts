// Proporção, detalhe, retrato e PDF da Grade, sem banco.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { textoProporcao } from "@/domain/detalhe-grade";
import {
  analisarDiaDoAluno,
  montarGrade,
  type Aluno,
  type Frequencia,
  type Horario,
} from "@/domain/frequencia";
import { textoDoPdf } from "@/domain/pdf-texto";
import {
  canonicoDoRetrato,
  codigoDoHash,
  linhasDoRelatorio,
  pdfDaGrade,
  type RetratoDaGrade,
} from "@/domain/relatorio-grade";

const aluno: Aluno = {
  id: "aluno-1",
  nome: "Ágata Lima",
  turmaId: "turma-a",
  turmaOriginalId: "turma-a",
  ordem: 1,
  ativo: true,
};
const horarios: Horario[] = [1, 2, 3, 4, 5].map((ordem) => ({
  id: `aula-${ordem}`,
  turmaId: "turma-a",
  ordem,
  inicio: `07:${String(ordem).padStart(2, "0")}`,
  fim: `07:${String(ordem + 40).padStart(2, "0")}`,
  diasSemana: [1, 2, 3, 4, 5],
  ativo: true,
}));

function chamada(
  faltas: Frequencia["faltas"],
  aulas = horarios.map((item) => item.id),
): Frequencia {
  return {
    dia: "2026-11-02",
    turmaId: "turma-a",
    revisao: 2,
    atualizadoEm: "2026-11-02T15:00:00.000Z",
    atualizadoPorNome: null,
    alunos: [aluno.id],
    aulas,
    faltas,
  };
}

function retrato(faltas: RetratoDaGrade["frequencias"][number]["faltas"]): RetratoDaGrade {
  return {
    versao: 1,
    instante: "2026-11-26T14:00:00.000Z",
    turmaOriginalId: "turma-a",
    rotulo: "1º ano A",
    de: "2026-11-02",
    ate: "2026-11-02",
    alunos: [aluno],
    frequencias: [
      {
        dia: "2026-11-02",
        turmaId: "turma-a",
        revisao: 2,
        atualizadoEm: "2026-11-02T15:00:00.000Z",
        alunos: [aluno.id],
        aulas: horarios.map((item) => item.id),
        faltas,
      },
    ],
    horarios: horarios.map((item) => ({ ...item, disciplinas: { "1": "Matemática" } })),
    justificativas: [{ codigo: "CM", rotulo: "Consulta Médica" }],
    historico: [{ alunoId: aluno.id, faltas: 3, faltasJustificadas: 1 }],
  };
}

describe("proporção e detalhe da grade", () => {
  it("mostra 2/5 quando duas das cinco aulas do retrato foram faltadas", () => {
    const frequencia = chamada([
      { alunoId: aluno.id, horarios: ["aula-1"], justificativa: "CM", observacao: "manhã" },
      { alunoId: aluno.id, horarios: ["aula-4"] },
    ]);
    const analise = analisarDiaDoAluno(aluno, "2026-11-02", [frequencia], horarios);
    expect(analise.marca).toBe("S");
    expect(analise).toMatchObject({ faltadas: 2, previstas: 5 });
    const grade = montarGrade([aluno], [frequencia], ["2026-11-02"], horarios);
    const linha = grade.linhas[0];
    const proporcao = linha?.proporcoes["2026-11-02"];
    expect(proporcao && textoProporcao(proporcao)).toBe("2/5");
    expect(linha?.parciais).toBe(1);
    expect(linha?.faltas).toBe(0);
    expect(linha?.detalhes[0]?.aulas.map((aula) => aula.horarioId)).toEqual(["aula-1", "aula-4"]);
    expect(linha?.detalhes[0]?.aulas[0]).toMatchObject({
      justificativa: "CM",
      observacao: "manhã",
    });
    expect(linha?.detalhes[0]?.aulas[1]?.justificativa).toBeNull();
  });

  it("não inventa proporção na falta integral", () => {
    const frequencia = chamada([
      { alunoId: aluno.id, horarios: horarios.map((item) => item.id), justificativa: "D" },
    ]);
    const grade = montarGrade([aluno], [frequencia], ["2026-11-02"], horarios);
    expect(grade.linhas[0]?.marcas["2026-11-02"]).toBe("FJ");
    expect(grade.linhas[0]?.proporcoes["2026-11-02"]).toBeUndefined();
    expect(grade.linhas[0]?.justificadas).toBe(1);
  });
});

describe("retrato e PDF", () => {
  const base = retrato([
    { alunoId: aluno.id, horarioId: "aula-1", justificativa: "CM", observacao: null },
    { alunoId: aluno.id, horarioId: "aula-4", justificativa: null, observacao: null },
  ]);
  const hash = createHash("sha256").update(canonicoDoRetrato(base)).digest("hex");

  it("repete o hash da mesma leitura e muda quando a falta muda", () => {
    expect(canonicoDoRetrato(base)).toBe(canonicoDoRetrato(structuredClone(base)));
    expect(codigoDoHash(hash)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    const outra = retrato([
      { alunoId: aluno.id, horarioId: "aula-1", justificativa: "CM", observacao: null },
    ]);
    expect(canonicoDoRetrato(outra)).not.toBe(canonicoDoRetrato(base));
    const outroInstante = { ...base, instante: "2026-11-26T14:00:01.000Z" };
    expect(canonicoDoRetrato(outroInstante)).not.toBe(canonicoDoRetrato(base));
  });

  it("imprime resumo, detalhe, instante, hash e código", () => {
    const frequencias: Frequencia[] = [
      chamada([
        { alunoId: aluno.id, horarios: ["aula-1"], justificativa: "CM" },
        { alunoId: aluno.id, horarios: ["aula-4"] },
      ]),
    ];
    const usados = base.horarios.map((item) => ({ ...item }));
    const texto = linhasDoRelatorio(base, hash, frequencias, usados).join("\n");
    expect(texto).toContain("Ágata Lima | 0 | 0 | 1 | 4");
    expect(texto).toContain("2/5");
    expect(texto).toContain("Consulta Médica");
    expect(texto).toContain("Sem justificativa");
    expect(texto).toContain("1ª aula");
    expect(texto).toContain(`Retrato: ${base.instante}`);
    expect(texto).toContain(`Hash: ${hash}`);
    expect(texto).toContain(`Código: ${codigoDoHash(hash)}`);
    const pdf = pdfDaGrade(base, hash, frequencias, usados);
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const extraido = textoDoPdf(pdf);
    expect(extraido).toContain(hash);
    expect(extraido).toContain("Ágata Lima");
    expect(extraido).toContain("2/5");
    expect(extraido).toContain("Matemática");
  });
});
