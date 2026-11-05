// Confere meses, links e coordenadas de texto do documento de chamadas.
import { describe, expect, it } from "vitest";
import { montarIndiceChamadas } from "@/domain/indice-chamadas";

describe("índice das chamadas", () => {
  it("ordena meses entre anos e turmas naturalmente, com links nas posições exatas", () => {
    const abas = [
      {
        mes: "2025-12",
        aba: "QA 1º A",
        url: "https://docs.google.com/spreadsheets/d/qa/edit#gid=1",
      },
      {
        mes: "2026-10",
        aba: "QA 10º A",
        url: "https://docs.google.com/spreadsheets/d/qa/edit#gid=2",
      },
      {
        mes: "2026-10",
        aba: "QA 2º A",
        url: "https://docs.google.com/spreadsheets/d/qa/edit#gid=3",
      },
    ];
    const anterior = structuredClone(abas);
    const indice = montarIndiceChamadas("https://docs.google.com/spreadsheets/d/qa/edit", abas);
    expect(indice.texto.indexOf("2026")).toBeLessThan(indice.texto.indexOf("2025"));
    expect(indice.texto.indexOf("QA 2º A")).toBeLessThan(indice.texto.indexOf("QA 10º A"));
    const links = indice.estilos.filter((pedido) => pedido.updateTextStyle);
    expect(links).toHaveLength(3);
    for (const pedido of links) {
      const estilo = pedido.updateTextStyle as {
        range: { startIndex: number; endIndex: number };
        textStyle: { link: { url: string } };
      };
      const aba = abas.find((item) => item.url === estilo.textStyle.link.url);
      expect(indice.texto.slice(estilo.range.startIndex - 1, estilo.range.endIndex - 1)).toBe(
        aba?.aba,
      );
    }
    expect(abas).toEqual(anterior);
  });
});
