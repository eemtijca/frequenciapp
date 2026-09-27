// Planilha de saídas: detecção de cabeçalho e colunas, plano conservador,
// correção e remoção no modo completo.
import { describe, expect, it } from "vitest";
import {
  detectarEsquemaSaida,
  detectarLinhaCabecalhoSaida,
  planejarSaidas,
  type AbaSaidaEsquema,
  type SaidaPlanilha,
} from "@/domain/planilha-saidas";
import type { LeituraAba } from "@/domain/planilha";

const CABECALHO = [
  "Data",
  "Aluno",
  "Turma",
  "Momento",
  "Justificativa",
  "Observação",
  "Liberado por",
];

function leitura(valores: string[][], linhasCriadas: number[] = []): LeituraAba {
  return {
    nome: "Saiu mais cedo",
    valores,
    formula: valores.map((linha) => linha.map(() => false)),
    linhaInicial: 1,
    colunaInicial: 1,
    linhasCriadas,
    colunasCriadas: [],
  };
}

function saida(parcial: Partial<SaidaPlanilha> & { nome: string; dia: string }): SaidaPlanilha {
  return {
    id: `saida-${parcial.nome}-${parcial.dia}`,
    alunoId: `aluno-${parcial.nome}`,
    turma: "1º ano A",
    momento: "1ª aula",
    justificativa: "Consulta",
    observacao: "",
    liberadoPor: "Direção",
    ...parcial,
  };
}

function esquemaComValores(valores: string[][]): AbaSaidaEsquema {
  return detectarEsquemaSaida({ nome: "Saiu mais cedo", valores });
}

describe("esquema da aba de saídas", () => {
  it("encontra o cabeçalho abaixo de uma linha de título", () => {
    const valores = [
      ["Registro de saídas"],
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
    ];
    expect(detectarLinhaCabecalhoSaida(valores)).toBe(2);
    const esquema = esquemaComValores(valores);
    expect(esquema.cabecalho).toBe(2);
    expect(esquema.ultimaLinhaDados).toBe(3);
    expect(esquema.colunas.find((coluna) => coluna.atributo === "aluno")?.indice).toBe(2);
    expect(esquema.colunas.find((coluna) => coluna.atributo === "data")?.indice).toBe(1);
    expect(esquema.bloqueio).toBeUndefined();
  });

  it("bloqueia a aba sem Aluno ou Data", () => {
    const esquema = esquemaComValores([["Nome", "Turma"]]);
    expect(esquema.bloqueio).toContain("Aluno e Data");
  });

  it("bloqueia a aba com mesclagem sobre coluna mapeada", () => {
    const esquema = detectarEsquemaSaida({
      nome: "Saiu mais cedo",
      valores: [CABECALHO],
      mesclagens: ["A1:B1"],
    });
    expect(esquema.bloqueio).toContain("mesclagem");
  });

  it("mantém a assinatura igual à do script para o mesmo cabeçalho", () => {
    const esquema = esquemaComValores([CABECALHO]);
    expect(esquema.assinatura).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("plano da aba de saídas", () => {
  it("cria linha nova para saída sem correspondência", () => {
    const valores = [
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
    ];
    const esquema = esquemaComValores(valores);
    const plano = planejarSaidas(
      esquema,
      [saida({ nome: "Carla", dia: "2026-09-03" })],
      leitura(valores),
      { modo: "conservador", de: "2026-09-01", ate: "2026-09-30", anoReferencia: 2026 },
    );
    expect(plano.resumo.criar).toBe(1);
    expect(plano.criar[0]?.linha).toBe(3);
    expect(plano.criar[0]?.celulas).toContainEqual({ coluna: 1, valor: "03/09/2026" });
    expect(plano.criar[0]?.celulas).toContainEqual({ coluna: 2, valor: "Carla" });
    expect(plano.resumo.preencher).toBe(0);
  });

  it("preenche célula vazia e pula divergência no conservador", () => {
    const valores = [
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
    ];
    const esquema = esquemaComValores(valores);
    const plano = planejarSaidas(
      esquema,
      [
        saida({
          nome: "Ana",
          dia: "2026-09-01",
          justificativa: "Atestado",
          observacao: "Saiu após a chamada",
        }),
      ],
      leitura(valores),
      { modo: "conservador", de: "2026-09-01", ate: "2026-09-30", anoReferencia: 2026 },
    );
    expect(plano.resumo.criar).toBe(0);
    expect(plano.resumo.preencher).toBe(1);
    expect(plano.resumo.puladasOcupadas).toBe(1);
    expect(plano.preencher[0]?.campo).toBe("observacao");
  });

  it("substitui divergência de linha criada pela integração no modo completo", () => {
    const valores = [
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
    ];
    const esquema = esquemaComValores(valores);
    const opcoes = { de: "2026-09-01", ate: "2026-09-30", anoReferencia: 2026 } as const;
    const conservador = planejarSaidas(
      esquema,
      [saida({ nome: "Ana", dia: "2026-09-01", justificativa: "Atestado" })],
      leitura(valores, [2]),
      { ...opcoes, modo: "conservador" },
    );
    expect(conservador.resumo.substituir).toBe(0);
    const completo = planejarSaidas(
      esquema,
      [saida({ nome: "Ana", dia: "2026-09-01", justificativa: "Atestado" })],
      leitura(valores, [2]),
      { ...opcoes, modo: "completo" },
    );
    expect(completo.resumo.substituir).toBe(1);
    expect(completo.substituir[0]?.anterior).toBe("Consulta");
    expect(completo.substituir[0]?.campo).toBe("justificativa");
  });

  it("não substitui divergência de linha manual nem no modo completo", () => {
    const valores = [
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
    ];
    const esquema = esquemaComValores(valores);
    const plano = planejarSaidas(
      esquema,
      [saida({ nome: "Ana", dia: "2026-09-01", justificativa: "Atestado" })],
      leitura(valores, []),
      { modo: "completo", de: "2026-09-01", ate: "2026-09-30", anoReferencia: 2026 },
    );
    expect(plano.resumo.substituir).toBe(0);
    expect(plano.resumo.puladasOcupadas).toBe(1);
  });

  it("lista ambiguidade quando o aluno tem mais de uma linha no dia", () => {
    const valores = [
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
      ["01/09/2026", "Ana", "1º ano A", "2ª aula", "Consulta", "", "Direção"],
    ];
    const esquema = esquemaComValores(valores);
    const plano = planejarSaidas(
      esquema,
      [saida({ nome: "Ana", dia: "2026-09-01" })],
      leitura(valores),
      { modo: "conservador", de: "2026-09-01", ate: "2026-09-30", anoReferencia: 2026 },
    );
    expect(plano.resumo.ambiguidades).toBe(1);
    expect(plano.avisos[0]).toContain("mais de uma linha");
  });

  it("candidateia remoção só em linha marcada, no período e sem saída", () => {
    const valores = [
      CABECALHO,
      ["01/09/2026", "Ana", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
      ["02/09/2026", "Bruno", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
      ["15/08/2026", "Carla", "1º ano A", "1ª aula", "Consulta", "", "Direção"],
    ];
    const esquema = esquemaComValores(valores);
    const plano = planejarSaidas(
      esquema,
      [saida({ nome: "Ana", dia: "2026-09-01" })],
      leitura(valores, [2, 3, 4]),
      {
        modo: "completo",
        de: "2026-09-01",
        ate: "2026-09-30",
        anoReferencia: 2026,
        removerLinhas: [3],
      },
    );
    expect(plano.candidatosRemocao.map((item) => item.linha)).toEqual([3]);
    expect(plano.remover).toHaveLength(1);
    expect(plano.remover[0]?.nome).toBe("Bruno");
  });

  it("devolve plano bloqueado quando a aba tem bloqueio", () => {
    const esquema = detectarEsquemaSaida({ nome: "Saiu mais cedo", valores: [["Nome", "Turma"]] });
    const plano = planejarSaidas(esquema, [], leitura([["Nome", "Turma"]]), {
      modo: "conservador",
      de: "2026-09-01",
      ate: "2026-09-30",
      anoReferencia: 2026,
    });
    expect(plano.bloqueado).toBe(true);
    expect(plano.resumo.criar).toBe(0);
    expect(plano.avisos[0]).toContain("Aluno e Data");
  });

  it("mantém o hash estável para o mesmo plano", () => {
    const valores = [CABECALHO];
    const esquema = esquemaComValores(valores);
    const montar = () =>
      planejarSaidas(esquema, [saida({ nome: "Ana", dia: "2026-09-01" })], leitura(valores), {
        modo: "conservador",
        de: "2026-09-01",
        ate: "2026-09-30",
        anoReferencia: 2026,
      });
    expect(montar().planoHash).toBe(montar().planoHash);
  });
});
