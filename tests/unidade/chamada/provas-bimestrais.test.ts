// Provas bimestrais: validação da prova, sobreposição de janelas e leitura das próximas provas por data.
import { describe, expect, it } from "vitest";
import {
  janelasSeSobrepoem,
  problemaNaProva,
  provasPorDia,
  proximasProvasDaTurma,
  type ProvaBimestral,
} from "@/domain/provas-bimestrais";

// 2026-11-23 é segunda; 2026-11-29 é domingo.
const HOJE = "2026-11-23";
const valida = { dia: "2026-11-24", inicio: "07:00", fim: "09:00", disciplina: "Matemática" };

describe("validação da prova bimestral", () => {
  it("aceita prova de hoje em diante, inclusive no sábado", () => {
    expect(problemaNaProva(valida, HOJE)).toBeNull();
    expect(problemaNaProva({ ...valida, dia: HOJE }, HOJE)).toBeNull();
    expect(problemaNaProva({ ...valida, dia: "2026-11-28" }, HOJE)).toBeNull();
  });

  it("recusa data inválida, passada ou no domingo", () => {
    expect(problemaNaProva({ ...valida, dia: "2026-02-30" }, HOJE)).toBe("Data da prova inválida.");
    expect(problemaNaProva({ ...valida, dia: "2026-11-22" }, HOJE)).toBe(
      "A data da prova já passou.",
    );
    expect(problemaNaProva({ ...valida, dia: "2026-11-29" }, HOJE)).toBe("Domingo não tem aula.");
  });

  it("recusa horário inválido ou com o fim antes do início", () => {
    expect(problemaNaProva({ ...valida, inicio: "7:00" }, HOJE)).toBe(
      "Horário de início inválido.",
    );
    expect(problemaNaProva({ ...valida, fim: "24:00" }, HOJE)).toBe("Horário de fim inválido.");
    expect(problemaNaProva({ ...valida, fim: "07:00" }, HOJE)).toBe(
      "O horário de fim deve ser posterior ao de início.",
    );
  });

  it("exige disciplina com até 80 caracteres", () => {
    expect(problemaNaProva({ ...valida, disciplina: "   " }, HOJE)).toBe(
      "Informe a disciplina da prova.",
    );
    expect(problemaNaProva({ ...valida, disciplina: "a".repeat(81) }, HOJE)).toBe(
      "A disciplina deve ter no máximo 80 caracteres.",
    );
    expect(problemaNaProva({ ...valida, disciplina: "a".repeat(80) }, HOJE)).toBeNull();
  });
});

describe("janelas e leitura das provas", () => {
  it("considera sobreposição só quando as janelas se cruzam", () => {
    const manha = { inicio: "07:00", fim: "09:00" };
    expect(janelasSeSobrepoem(manha, { inicio: "08:00", fim: "10:00" })).toBe(true);
    expect(janelasSeSobrepoem(manha, { inicio: "07:30", fim: "08:30" })).toBe(true);
    // Uma prova pode começar no minuto em que a outra termina.
    expect(janelasSeSobrepoem(manha, { inicio: "09:00", fim: "10:00" })).toBe(false);
    expect(janelasSeSobrepoem(manha, { inicio: "06:00", fim: "07:00" })).toBe(false);
  });

  const provas: ProvaBimestral[] = [
    {
      id: "4",
      turmaId: "a",
      dia: "2026-11-25",
      inicio: "07:00",
      fim: "09:00",
      disciplina: "Física",
    },
    {
      id: "1",
      turmaId: "a",
      dia: "2026-11-20",
      inicio: "07:00",
      fim: "09:00",
      disciplina: "Química",
    },
    {
      id: "3",
      turmaId: "a",
      dia: "2026-11-24",
      inicio: "09:30",
      fim: "11:00",
      disciplina: "Biologia",
    },
    {
      id: "2",
      turmaId: "a",
      dia: "2026-11-24",
      inicio: "07:00",
      fim: "09:00",
      disciplina: "História",
    },
    { id: "5", turmaId: "b", dia: "2026-11-24", inicio: "07:00", fim: "09:00", disciplina: "Arte" },
  ];

  it("mostra só as provas da turma de hoje em diante, em ordem de data e de início", () => {
    expect(proximasProvasDaTurma(provas, "a", HOJE).map((prova) => prova.id)).toEqual([
      "2",
      "3",
      "4",
    ]);
    expect(proximasProvasDaTurma(provas, undefined, HOJE)).toEqual([]);
  });

  it("agrupa as provas ordenadas por data", () => {
    const grupos = provasPorDia(proximasProvasDaTurma(provas, "a", HOJE));
    expect(grupos.map((grupo) => [grupo.dia, grupo.provas.map((prova) => prova.id)])).toEqual([
      ["2026-11-24", ["2", "3"]],
      ["2026-11-25", ["4"]],
    ]);
    expect(provasPorDia([])).toEqual([]);
  });
});
