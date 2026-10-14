// Regressões visuais do BI: dados completos no mapa, homônimos, paginação e proporção da imagem.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { graficoBi } from "@/domain/bi-painel";
import type { PontoBi } from "@/domain/bi-analise";
import VistaGrafico from "@/components/bi/vista-grafico";
import {
  encaixarImagemBi,
  formatarValorBi,
  paginaTabelaBi,
  prepararCalorBi,
  rotularPontosBi,
  rotuloEixoBi,
} from "@/lib/bi-visualizacao";

const ponto = (nome: string, grupo: string, valor: number | null): PontoBi => ({
  nome,
  grupo,
  valor,
  referencia: nome,
  grupoReferencia: grupo,
  registros: 1,
  alunos: 1,
});

describe("visualização do FrequenciBI", () => {
  it("preenche as 240 células do mapa sem perder registros depois do centésimo", () => {
    const pontos = Array.from({ length: 20 }, (_, x) =>
      Array.from({ length: 12 }, (_, y) =>
        ponto(`2026-10-${String(x + 1).padStart(2, "0")}`, `QA Turma ${y + 1}`, x * 12 + y),
      ),
    ).flat();
    const mapa = prepararCalorBi(pontos);
    expect(mapa.colunas).toHaveLength(20);
    expect(mapa.linhas).toHaveLength(12);
    expect(mapa.celulas.get(JSON.stringify(["2026-10-20", "QA Turma 12"]))?.valor).toBe(239);
    expect(mapa.omitidos).toBe(0);
    expect(mapa.maximo).toBe(239);
  });

  it("distingue valor zero, ponto sem denominador e célula ausente no mapa", () => {
    const mapa = prepararCalorBi([ponto("01", "QA A", 0), ponto("02", "QA A", null)]);
    expect(mapa.celulas.get(JSON.stringify(["01", "QA A"]))?.valor).toBe(0);
    expect(mapa.celulas.get(JSON.stringify(["02", "QA A"]))?.valor).toBeNull();
    expect(mapa.celulas.has(JSON.stringify(["03", "QA A"]))).toBe(false);
    expect(formatarValorBi(null, "infrequencia")).toBe("Sem base de cálculo");
    expect(formatarValorBi(0, "infrequencia")).toBe("0%");
  });

  it("mantém homônimos distintos mesmo quando os identificadores começam iguais", () => {
    const originais = [
      {
        ...ponto("QA Nome", "QA Turma", 1),
        referencia: "12345678-a",
        grupoReferencia: "abcdefgh-a",
      },
      {
        ...ponto("QA Nome", "QA Turma", 2),
        referencia: "12345678-b",
        grupoReferencia: "abcdefgh-b",
      },
    ];
    const rotulados = rotularPontosBi(originais);
    expect(new Set(rotulados.map((p) => p.nome)).size).toBe(2);
    expect(new Set(rotulados.map((p) => p.grupo)).size).toBe(2);
    expect(originais[0]?.nome).toBe("QA Nome");
    expect(rotulados[1]?.referencia).toBe("12345678-b");
  });

  it("volta para página válida quando filtros reduzem os resultados", () => {
    expect(paginaTabelaBi(2, 120)).toBe(2);
    expect(paginaTabelaBi(2, 10)).toBe(0);
    expect(paginaTabelaBi(2, 0)).toBe(0);
    expect(paginaTabelaBi(2, 75)).toBe(1);
  });

  it("preserva proporção de roscas e apresenta os dias distinguíveis no eixo", () => {
    expect(encaixarImagemBi(400, 400, 1120, 620)).toEqual({ largura: 620, altura: 620 });
    expect(encaixarImagemBi(800, 200, 1120, 620)).toEqual({ largura: 1120, altura: 280 });
    expect(rotuloEixoBi("2026-10-01")).toBe("01/10");
    expect(rotuloEixoBi("2026-10-02")).toBe("02/10");
  });

  it("renderiza células de calor com alvo de toque e acesso por teclado, respeitando aparência", () => {
    const config = {
      ...graficoBi("chamadas", "dia", "infrequencia", "calor", "QA Mapa", "turma"),
      paleta: "azul" as const,
      mostrarValores: true,
    };
    const html = renderToStaticMarkup(
      createElement(VistaGrafico, {
        config,
        pontos: [ponto("2026-10-01", "QA A", 0), ponto("2026-10-02", "QA A", null)],
        onFiltrar: () => {},
      }),
    );
    expect(html).toContain('height="44"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('fill="#559cd6"');
    expect(html).toContain("01/10");
    expect(html).toContain("2026-10-02 | QA A: Sem base de cálculo");
    expect(html).toContain("N/D");
  });

  it("informa falta de base para todos os pontos nulos sem desenhar gráfico vazio", () => {
    const html = renderToStaticMarkup(
      createElement(VistaGrafico, {
        config: graficoBi("chamadas", "dia", "infrequencia", "linha", "QA Linha"),
        pontos: [ponto("2026-10-01", "", null)],
        onFiltrar: () => {},
      }),
    );
    expect(html).toContain("Sem base de cálculo neste recorte.");
    expect(html).not.toContain("<svg");
  });
});
