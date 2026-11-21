// Protege a identidade visual, os valores da rosca do Painel e o contrato semanal.
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import GraficoRosca, { type FatiaGrafico } from "@/components/painel/grafico-rosca";
import { tema } from "@/theme/tema";
import { semEstilos, textoVisivel } from "../../helpers/html";

function rosca(fatias: FatiaGrafico[], props: Partial<ComponentProps<typeof GraficoRosca>> = {}) {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme: tema },
      createElement(GraficoRosca, { titulo: "Faltas por série", fatias, ...props }),
    ),
  );
}

function coresDaLegenda(html: string) {
  return Array.from(semEstilos(html).matchAll(/style="background-color:([^"]+)"/g), (m) => m[1]);
}

const primeiro = { categoriaId: "serie-a", nome: "1º ano", valor: 1 };
const segundo = { categoriaId: "serie-b", nome: "2º ano", valor: 2 };

describe("rosca categórica do Painel", () => {
  it("conserva a cor da série quando a anterior zera e quando a série muda de nome", () => {
    const inicial = coresDaLegenda(rosca([primeiro, segundo]));
    expect(inicial).toHaveLength(2);
    expect(inicial[0]).not.toBe(inicial[1]);
    expect(coresDaLegenda(rosca([{ ...primeiro, valor: 0 }, segundo]))).toEqual([inicial[1]]);
    expect(coresDaLegenda(rosca([{ ...segundo, nome: "Série renomeada" }, primeiro]))).toEqual([
      inicial[1],
      inicial[0],
    ]);
  });

  it("mantém total, quantidades, proporções e detalhe em texto sem exigir a leitura das cores", () => {
    const html = rosca([primeiro, { ...segundo, detalhe: "4 de 5 alunos com chamada" }]);
    const tabela = semEstilos(html).match(
      /<table\b[^>]*aria-label="Legenda de Faltas por série"[^>]*>[\s\S]*?<\/table>/,
    )?.[0];
    expect(tabela).toBeDefined();
    const texto = textoVisivel(tabela ?? "");
    expect(texto).toContain("1º ano 1 33,3%");
    expect(texto).toContain("2º ano 4 de 5 alunos com chamada 2 66,7%");
    expect(textoVisivel(html)).toContain("3 faltas");
    const reduzida = rosca([{ ...primeiro, valor: 0 }, segundo]);
    expect(textoVisivel(reduzida)).toContain("2º ano 2 100%");
    expect(textoVisivel(reduzida)).not.toContain("1º ano");
    expect(textoVisivel(reduzida)).toContain("2 faltas");
  });

  it("mostra o estado vazio sem gráfico quando todas as categorias ficam zeradas", () => {
    const html = rosca([
      { ...primeiro, valor: 0 },
      { ...segundo, valor: 0 },
    ]);
    expect(textoVisivel(html)).toBe("Nenhuma falta registrada");
    expect(semEstilos(html)).not.toContain('role="img"');
  });
});

it("preserva os rótulos de quantidade, proporção e vazio das roscas semanais", () => {
  const fatias = [
    { nome: "Faltas", valor: 0 },
    { nome: "Justificadas", valor: 1, unidadeSingular: "falta justificada" },
    { nome: "Presentes", valor: 3, unidadePlural: "presenças" },
  ];
  const html = semEstilos(rosca(fatias, { rotuloTotal: "F + FJ + P" }));
  expect(html).toContain('aria-label="Legenda de Faltas por série"');
  expect(html).toContain('aria-label="1 falta justificada"');
  expect(html).toContain('aria-label="3 presenças"');
  expect(html).toContain('aria-label="25% do total"');
  expect(textoVisivel(html)).toContain("4 F + FJ + P");
  expect(textoVisivel(rosca([], { vazio: "Nenhum ajuste nesta semana" }))).toBe(
    "Nenhum ajuste nesta semana",
  );
});
