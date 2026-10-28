// Verifica o instante de atualização apresentado com a data no fuso da escola.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AtualizadoEm } from "@/components/ui/atualizado-em";

describe("rótulo de atualização", () => {
  it("preserva o estado sem leitura quando o instante é ausente ou inválido", () => {
    for (const instante of [undefined, "inválido"]) {
      const html = renderToStaticMarkup(
        createElement(AtualizadoEm, { instante, fuso: "America/Fortaleza" }),
      );
      expect(html).toContain("</svg>Ainda não atualizado</span>");
    }
  });

  it("exibe data e hora da leitura no fuso da escola", () => {
    const html = renderToStaticMarkup(
      createElement(AtualizadoEm, {
        instante: "2026-01-01T01:30:00.000Z",
        fuso: "America/Fortaleza",
      }),
    );
    expect(html).toContain("</svg>Atualizado em 31/12/2025 às 22:30</span>");
  });
});
