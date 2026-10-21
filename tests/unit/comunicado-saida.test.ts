// Confere o texto formal com datas civis, horários do registro e ausência de dados pessoais extras.
import { describe, expect, it } from "vitest";
import { gerarComunicadoSaida } from "@/domain/comunicado-saida";

describe("comunicado de saída", () => {
  it("preenche o comunicado formal com aluno, turma, data e horário", () => {
    expect(
      gerarComunicadoSaida({
        nome: " QA Estudante ",
        turma: " 2º ano A ",
        dia: "2026-10-21",
        horario: "10:35",
      }),
    ).toBe(
      "Prezados responsáveis,\n\nInformamos que a Coordenação Escolar autorizou a saída antecipada de QA Estudante, da turma 2º ano A, em 21/10/2026, às 10:35.\n\nAtenciosamente,\nCoordenação Escolar",
    );
  });

  it("preserva a data civil e o horário mesmo na virada do ano", () => {
    const texto = gerarComunicadoSaida({
      nome: "QA Estudante",
      turma: "1º ano B",
      dia: "2026-01-01",
      horario: "00:00",
    });
    expect(texto).toContain("em 01/01/2026, às 00:00.");
  });

  it("omite o horário ausente e não usa autoria ou justificativa como parte da mensagem", () => {
    const registro = {
      nome: "QA Estudante",
      turma: "3º ano C",
      dia: "2026-09-03",
      horario: null,
      criadoEm: "2026-09-03T17:30:00Z",
      texto: "QA Motivo reservado",
      liberadoPorNome: "QA Equipe",
    };
    const texto = gerarComunicadoSaida(registro);
    expect(texto).toContain("em 03/09/2026.");
    expect(texto).not.toContain("às");
    expect(texto).not.toContain("17:30");
    expect(texto).not.toContain("Motivo reservado");
    expect(texto).not.toContain("QA Equipe");
  });
});
