// Domínio da frequência: validações de data, rótulos, marca do aluno e grade.
import { describe, expect, it } from "vitest";
import {
  diaLocal,
  diasDoMes,
  ehDiaValido,
  ehMesValido,
  marcaDoAluno,
  montarGrade,
  normalizar,
  resumirChamada,
  rotuloDeTurma,
  type Aluno,
  type Chamada,
} from "@/domain/frequencia";

function aluno(parcial: Partial<Aluno> = {}): Aluno {
  return {
    id: parcial.id ?? "aluno-1",
    nome: parcial.nome ?? "Aluno Um",
    turmaId: parcial.turmaId ?? "turma-a",
    turmaOriginalId: parcial.turmaOriginalId ?? "turma-a",
    ordem: parcial.ordem ?? 1,
    ativo: parcial.ativo ?? true,
  };
}

function chamada(parcial: Partial<Chamada> = {}): Chamada {
  return {
    dia: parcial.dia ?? "2026-09-10",
    turmaId: parcial.turmaId ?? "turma-a",
    revisao: parcial.revisao ?? 1,
    atualizadoEm: parcial.atualizadoEm ?? "2026-09-10T12:00:00Z",
    faltas: parcial.faltas ?? [],
  };
}

describe("ehDiaValido", () => {
  it("aceita dias reais do calendário", () => {
    expect(ehDiaValido("2026-09-25")).toBe(true);
    expect(ehDiaValido("2000-02-29")).toBe(true);
  });
  it("recusa formatos e datas impossíveis", () => {
    expect(ehDiaValido("2026-9-25")).toBe(false);
    expect(ehDiaValido("2026-02-30")).toBe(false);
    expect(ehDiaValido("25/09/2026")).toBe(false);
    expect(ehDiaValido("")).toBe(false);
    expect(ehDiaValido("2026-13-01")).toBe(false);
  });
});

describe("ehMesValido", () => {
  it("aceita meses reais", () => {
    expect(ehMesValido("2026-09")).toBe(true);
    expect(ehMesValido("2026-12")).toBe(true);
  });
  it("recusa meses impossíveis e formatos soltos", () => {
    expect(ehMesValido("2026-13")).toBe(false);
    expect(ehMesValido("2026-00")).toBe(false);
    expect(ehMesValido("2026-9")).toBe(false);
    expect(ehMesValido("202609")).toBe(false);
  });
});

describe("rotuloDeTurma", () => {
  it("compõe série e turma com espaços controlados", () => {
    expect(rotuloDeTurma("1º ano", "A")).toBe("1º ano A");
    expect(rotuloDeTurma(" 2º ano ", " B ")).toBe("2º ano B");
  });
  it("mantém a turma quando a série vem vazia", () => {
    expect(rotuloDeTurma("", "C")).toBe("C");
  });
});

describe("diaLocal", () => {
  it("resolve o dia no fuso pedido", () => {
    const instante = new Date("2026-09-25T02:30:00Z");
    expect(diaLocal(instante, "America/Fortaleza")).toBe("2026-09-24");
    expect(diaLocal(instante, "Asia/Tokyo")).toBe("2026-09-25");
  });
});

describe("diasDoMes", () => {
  it("lista todos os dias do mês", () => {
    const dias = diasDoMes("2026-02");
    expect(dias.length).toBe(28);
    expect(dias[0]).toBe("2026-02-01");
    expect(dias[27]).toBe("2026-02-28");
  });
  it("sabe fevereiro de ano bissexto", () => {
    expect(diasDoMes("2028-02").length).toBe(29);
  });
  it("sabe meses de 31 dias", () => {
    expect(diasDoMes("2026-01").length).toBe(31);
  });
});

describe("marcaDoAluno", () => {
  it("marca falta quando o aluno está na lista de faltas", () => {
    const alunoUm = aluno();
    const doDia = [chamada({ faltas: ["aluno-1"] })];
    expect(marcaDoAluno(alunoUm, "2026-09-10", doDia)).toBe("F");
  });
  it("marca presente quando a turma dele teve chamada", () => {
    const doDia = [chamada({ turmaId: "turma-a", faltas: [] })];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia)).toBe("P");
  });
  it("devolve vazio quando a turma não foi chamada", () => {
    const doDia = [chamada({ turmaId: "turma-b" })];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia)).toBe(null);
  });
  it("falta prevalece mesmo com outra chamada presente no dia", () => {
    const doDia = [
      chamada({ turmaId: "turma-a", faltas: [] }),
      chamada({ turmaId: "turma-b", faltas: ["aluno-1"] }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia)).toBe("F");
  });
});

describe("montarGrade", () => {
  it("agrupa marcas, faltas e chamadas por aluno", () => {
    const alunos = [aluno(), aluno({ id: "aluno-2", nome: "Aluno Dois", ordem: 2 })];
    const chamadas = [
      chamada({ dia: "2026-09-10", turmaId: "turma-a", faltas: ["aluno-1"] }),
      chamada({ dia: "2026-09-11", turmaId: "turma-a", faltas: ["aluno-1", "aluno-2"] }),
    ];
    const grade = montarGrade(alunos, chamadas, "2026-09");
    expect(grade.dias.length).toBe(30);
    const primeiro = grade.linhas[0];
    expect(primeiro?.aluno.id).toBe("aluno-1");
    expect(primeiro?.faltas).toBe(2);
    expect(primeiro?.chamadas).toBe(2);
    const segundo = grade.linhas[1];
    expect(segundo?.marcas["2026-09-10"]).toBe("P");
    expect(segundo?.marcas["2026-09-11"]).toBe("F");
  });
  it("ordena linhas por ordem e desempata por nome", () => {
    const alunos = [
      aluno({ id: "a", nome: "Zeca", ordem: 2 }),
      aluno({ id: "b", nome: "Ana", ordem: 2 }),
      aluno({ id: "c", nome: "Bia", ordem: 1 }),
    ];
    const grade = montarGrade(alunos, [], "2026-09");
    expect(grade.linhas.map((linha) => linha.aluno.id)).toEqual(["c", "b", "a"]);
  });
});

describe("resumirChamada", () => {
  it("conta apenas alunos ativos da turma da chamada", () => {
    const alunos = [
      aluno({ id: "a1", turmaId: "turma-a" }),
      aluno({ id: "a2", turmaId: "turma-a" }),
      aluno({ id: "a3", turmaId: "turma-a", ativo: false }),
      aluno({ id: "a4", turmaId: "turma-b" }),
    ];
    const resumo = resumirChamada(chamada({ turmaId: "turma-a" }), alunos, "turma-a");
    expect(resumo.totalAlunos).toBe(2);
  });
});

describe("normalizar", () => {
  it("remove acentos, ordinais e caixa para busca", () => {
    expect(normalizar("3º Ano")).toBe("3o ano");
    expect(normalizar("ÇÃ")).toBe("ca");
    expect(normalizar("Ana Pa´ula")).toContain("ana");
  });
});
