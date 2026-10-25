// Compatibilidade das configurações locais e preservação das escolhas visuais na exportação.
import { describe, expect, it } from "vitest";
import { esquemaGraficoBi } from "@/domain/bi-analise";
import { exportarPersonalizacaoBi, migrarPersonalizacaoBi } from "@/domain/bi-personalizacao";

const filtros = { inicio: "2026-09-01", fim: "2026-09-30" };
const graficoAntigo = {
  id: "qa-grafico",
  titulo: "QA Infrequência",
  recurso: "chamadas",
  dimensao: "turma",
  medida: "infrequencia",
  tipo: "rosca",
  largura: 8,
  altura: 410,
  meta: 15,
  anotacao: "QA Meta mensal",
};
function configuracao(versao: 1 | 2) {
  const base = {
    versao,
    visoes: [graficoAntigo],
    paineis: [
      {
        id: "qa-painel",
        nome: "QA Setembro",
        filtros,
        graficos: [graficoAntigo],
        anotacao: "QA Acompanhamento",
      },
    ],
  };
  return versao === 1
    ? { ...base, filtros }
    : { ...base, preferencias: { filtros, aba: "paineis", painelPadrao: "qa-painel" } };
}

describe("aparência e tamanho dos gráficos do BI", () => {
  it.each([1, 2] as const)(
    "reabre configurações da versão %i sem perder metas, tamanhos ou recortes",
    (versao) => {
      const antiga = configuracao(versao);
      const antes = JSON.stringify(antiga);
      const recuperada = migrarPersonalizacaoBi(antiga);
      expect(recuperada.versao).toBe(2);
      expect(recuperada.preferencias.filtros).toMatchObject(filtros);
      expect(recuperada.visoes[0]).toMatchObject({
        ...graficoAntigo,
        paleta: "escola",
        mostrarLegenda: true,
        mostrarValores: false,
      });
      expect(recuperada.paineis[0]?.graficos[0]).toEqual(recuperada.visoes[0]);
      expect(recuperada.paineis[0]).toMatchObject({ filtros, anotacao: "QA Acompanhamento" });
      expect(JSON.stringify(antiga)).toBe(antes);
    },
  );

  it("mantém escolhas independentes entre visão e painel depois de exportar e importar", () => {
    const personalizada = migrarPersonalizacaoBi(configuracao(2));
    const painel = personalizada.paineis[0];
    expect(painel).toBeDefined();
    if (!painel) return;
    painel.graficos = [
      esquemaGraficoBi.parse({
        ...graficoAntigo,
        paleta: "violeta",
        mostrarLegenda: false,
        mostrarValores: true,
        largura: 12,
        altura: 900,
      }),
    ];
    const reaberta = migrarPersonalizacaoBi(JSON.parse(exportarPersonalizacaoBi(personalizada)));
    expect(reaberta).toEqual(personalizada);
    expect(reaberta.visoes[0]?.paleta).toBe("escola");
    expect(reaberta.paineis[0]?.graficos[0]).toMatchObject({
      paleta: "violeta",
      mostrarLegenda: false,
      mostrarValores: true,
      largura: 12,
      altura: 900,
    });
  });

  it.each([
    { paleta: "cor-desconhecida" },
    { mostrarLegenda: "false" },
    { mostrarValores: null },
    { largura: 2 },
    { largura: 13 },
    { largura: 6.5 },
    { altura: 259 },
    { altura: 901 },
  ])("recusa opções incompatíveis sem alterar a configuração original: %j", (opcao) => {
    const antiga = configuracao(2);
    const antes = JSON.stringify(antiga);
    const grafico = antiga.paineis[0]?.graficos[0];
    const invalida = {
      ...antiga,
      visoes: [{ ...grafico, ...opcao }],
    };
    expect(() => migrarPersonalizacaoBi(invalida)).toThrow();
    expect(JSON.stringify(antiga)).toBe(antes);
  });
});
