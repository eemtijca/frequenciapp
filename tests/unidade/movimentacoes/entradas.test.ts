// Horário de entrada e planejamento conservador com massa sintética.
import { describe, expect, it } from "vitest";
import { ehHorarioEntrada, type EntradaAtrasada } from "@/domain/entradas";
import {
  CABECALHO_ENTRADAS,
  CABECALHO_ENTRADAS_ANTERIOR,
  formatoCabecalhoEntradas,
  planejarEntradas,
} from "@/domain/planilha-entradas";
import { CABECALHO_SAIDAS } from "@/domain/planilha-saidas";
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
        "",
        "QA Coordenação",
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
  it("envia o momento e o responsável escolhido, mantendo compatibilidade com registros antigos", () => {
    const plano = planejarEntradas(
      [{ ...entrada, momento: "aula_2", responsavelRegistroNome: "QA Responsável" }],
      leitura(),
      [],
    );
    expect(plano.criar[0]?.celulas[3]?.valor).toBe("08:15 · 2ª aula");
    expect(plano.criar[0]?.celulas[6]?.valor).toBe("QA Responsável");
    const antigo = planejarEntradas(
      [{ ...entrada, momento: null, responsavelRegistroNome: null }],
      leitura(),
      [],
    );
    expect(antigo.criar[0]?.celulas[3]?.valor).toBe("08:15");
    expect(antigo.criar[0]?.celulas[6]?.valor).toBe("QA Coordenação");
  });
  it("preserva fórmula que exibe célula vazia na última linha", () => {
    const plano = planejarEntradas(
      [entrada],
      leitura([CABECALHO_ENTRADAS, [], []], [[], [], [true]]),
      [],
    );
    expect(plano.criar[0]?.linha).toBe(4);
  });
  it("reenvio reconhece a linha por data e aluno e não duplica após correção ou restauração", () => {
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
  it("reconhece a linha manual com o mesmo nome e data e preserva o conteúdo", () => {
    const plano = planejarEntradas(
      [entrada],
      leitura([CABECALHO_ENTRADAS, ["15/06/2026", "QA Aluno"]]),
      [],
    );
    expect(plano.criar).toEqual([]);
    expect(plano.existentes).toBe(1);
    expect(plano.avisos[0]).toContain("preservado");
  });
  it("usa uma linha por aluno homônimo no mesmo dia, sem código", () => {
    const outro = { ...entrada, id: "outro", alunoId: "outro-aluno" };
    const dois = planejarEntradas([entrada, outro], leitura(), []);
    expect(dois.criar).toHaveLength(2);
    expect(dois.criar.map((item) => item.linha)).toEqual([2, 3]);
    const linha = dois.criar[0]?.celulas.map((celula) => celula.valor) ?? [];
    const falta = planejarEntradas([entrada, outro], leitura([CABECALHO_ENTRADAS, linha]), []);
    expect(falta.existentes).toBe(1);
    expect(falta.criar).toHaveLength(1);
    expect(falta.criar[0]?.linha).toBe(3);
  });
  it("tem as mesmas colunas da aba de saídas", () => {
    expect(CABECALHO_ENTRADAS).toEqual(CABECALHO_SAIDAS);
    expect(CABECALHO_ENTRADAS).toHaveLength(7);
  });
  it("reconhece o formato anterior e orienta a preparar a aba", () => {
    expect(formatoCabecalhoEntradas(CABECALHO_ENTRADAS)).toBe("atual");
    expect(formatoCabecalhoEntradas(CABECALHO_ENTRADAS_ANTERIOR)).toBe("anterior");
    expect(formatoCabecalhoEntradas(["Data", "Aluno"])).toBe("outro");
    const plano = planejarEntradas([entrada], leitura([CABECALHO_ENTRADAS_ANTERIOR]), []);
    expect(plano.bloqueado).toBe(true);
    expect(plano.avisos[0]).toContain("formato anterior");
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
