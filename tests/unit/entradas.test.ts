// Horário de entrada e planejamento conservador com massa sintética.
import { describe, expect, it } from "vitest";
import { ehHorarioEntrada, type EntradaAtrasada } from "@/domain/entradas";
import { CABECALHO_ENTRADAS, planejarEntradas } from "@/domain/planilha-entradas";
import { assinarAba, type LeituraAba } from "@/domain/planilha";

const entrada: EntradaAtrasada = {
  id: "registro",
  alunoId: "aluno",
  nome: "QA Aluno",
  turmaId: "turma",
  turmaRotulo: "QA Ano A",
  dia: "2026-06-15",
  horario: "08:15",
  motivo: "Transporte atrasou",
  registradoPorNome: "QA Coordenação",
  criadoEm: "2026-06-15T12:00:00Z",
};
function leitura(
  valores: string[][] = [CABECALHO_ENTRADAS],
  formula: boolean[][] = [],
): LeituraAba {
  return {
    nome: "Entradas",
    valores,
    formula,
    linhaInicial: 1,
    colunaInicial: 1,
    linhasCriadas: [],
    colunasCriadas: [],
  };
}

describe("entradas atrasadas", () => {
  it.each(["00:00", "07:05", "23:59"])("aceita horário %s", (horario) =>
    expect(ehHorarioEntrada(horario)).toBe(true),
  );
  it.each(["24:00", "08:60", "8:15", "", "07:15:00", "-1:00"])("recusa horário %s", (horario) =>
    expect(ehHorarioEntrada(horario)).toBe(false),
  );
  it("propõe linha completa sem substituir células", () => {
    const plano = planejarEntradas([entrada], leitura(), []);
    expect(plano.bloqueado).toBe(false);
    expect(plano.criar[0]).toEqual({
      linha: 2,
      nome: "QA Aluno",
      celulas: [
        "15/06/2026",
        "QA Aluno",
        "QA Ano A",
        "08:15",
        "Transporte atrasou",
        "QA Coordenação",
        "aluno:2026-06-15",
      ].map((valor, i) => ({ coluna: i + 1, valor })),
    });
  });
  it("preserva a última linha com conteúdo fora das colunas do registro", () => {
    const linhas = [CABECALHO_ENTRADAS, [], ["", "", "", "", "", "", "", "Anotação manual"]];
    const plano = planejarEntradas([entrada], leitura(linhas), []);
    expect(plano.criar[0]?.linha).toBe(4);
    expect(plano.assinatura).toBe(assinarAba("Entradas", [...CABECALHO_ENTRADAS, ""], []));
    expect(linhas[2]?.[7]).toBe("Anotação manual");
  });
  it("preserva fórmula que exibe célula vazia na última linha", () => {
    const plano = planejarEntradas(
      [entrada],
      leitura([CABECALHO_ENTRADAS, [], []], [[], [], [true]]),
      [],
    );
    expect(plano.criar[0]?.linha).toBe(4);
  });
  it("reenvio reconhece o código e não duplica após correção ou restauração", () => {
    const primeiro = planejarEntradas([entrada], leitura(), []);
    const linha = primeiro.criar[0]?.celulas.map((celula) => celula.valor) ?? [];
    const plano = planejarEntradas(
      [{ ...entrada, id: "novo-registro", motivo: "Outro motivo" }],
      leitura([CABECALHO_ENTRADAS, linha]),
      [],
    );
    expect(plano.criar).toEqual([]);
    expect(plano.existentes).toBe(1);
    expect(plano.avisos).toHaveLength(1);
  });
  it("não associa registros manuais sem código por nome", () => {
    const plano = planejarEntradas(
      [entrada],
      leitura([CABECALHO_ENTRADAS, ["15/06/2026", "QA Aluno"]]),
      [],
    );
    expect(plano.criar).toEqual([]);
    expect(plano.avisos[0]).toContain("manual");
  });
  it("não confunde alunos homônimos identificados pelo código", () => {
    const plano = planejarEntradas(
      [entrada, { ...entrada, id: "outro", alunoId: "outro-aluno" }],
      leitura(),
      [],
    );
    expect(plano.criar).toHaveLength(2);
    expect(plano.criar.map((item) => item.celulas[6]?.valor).sort()).toEqual([
      "aluno:2026-06-15",
      "outro-aluno:2026-06-15",
    ]);
  });
  it("bloqueia aba incompatível, mesclada ou com fórmula no cabeçalho", () => {
    expect(
      planejarEntradas([entrada], leitura([["Data", "Aluno", "Turma", "Momento"]]), []).bloqueado,
    ).toBe(true);
    expect(planejarEntradas([entrada], leitura(), ["A1:B1"]).bloqueado).toBe(true);
    expect(planejarEntradas([entrada], leitura(undefined, [[true]]), []).bloqueado).toBe(true);
  });
  it("invalida prévia depois de edição no fim da aba ou no registro", () => {
    const primeiro = planejarEntradas([entrada], leitura(), []).planoHash;
    expect(
      planejarEntradas([entrada], leitura([CABECALHO_ENTRADAS, ["Nota"]]), []).planoHash,
    ).not.toBe(primeiro);
    expect(planejarEntradas([{ ...entrada, horario: "09:00" }], leitura(), []).planoHash).not.toBe(
      primeiro,
    );
  });
});
