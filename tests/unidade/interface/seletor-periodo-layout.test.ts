// Layout do gatilho do seletor de período: texto completo, quebra de linha,
// selo e detalhe, sem classes utilitárias do Tailwind.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

function renderizar(modo: "dia" | "mes", detalhe?: string) {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme: tema },
      createElement(SeletorPeriodo, {
        id: "periodo",
        modo,
        valor: modo === "dia" ? "2026-11-02" : "2026-11",
        max: modo === "dia" ? "2026-11-02" : "2026-11",
        rotuloAcessivel: "Período",
        rotulo: modo === "dia" ? "02/11/2026" : "Novembro",
        detalhe,
        onValor: () => {},
      }),
    ),
  );
}

describe("gatilho do seletor de período", () => {
  it("permite múltiplas linhas sem truncar texto e mantém a altura mínima", () => {
    const html = renderizar("dia", "segunda-feira");
    const gatilho = html.match(/<button\b[^>]*\bid="periodo"[^>]*>/)?.[0] ?? "";
    const fonte = readFileSync(
      path.resolve(process.cwd(), "src/components/ui/seletor-periodo.tsx"),
      "utf8",
    );

    expect(gatilho).not.toBe("");
    expect(gatilho).toContain("MuiButtonBase-root");
    expect(gatilho).not.toMatch(/overflow-hidden|\btruncate\b|\bwhitespace-nowrap\b/);
    expect(fonte).toContain("const ALTURA_GATILHO = 44");
    expect(fonte).toContain('flexWrap: "wrap"');
    expect(fonte).not.toContain("overflow-hidden");
    expect(fonte).not.toContain("textOverflow");

    expect(html).toContain("02/11/2026");
    expect(html).toContain("seg.");
    expect(html).toContain("segunda-feira");
    expect(html).toContain("Hoje");
    expect(html).toContain('data-detalhe="true"');
    expect(html).toContain('data-selo="true"');
    expect(html).toContain('aria-label="Período: 02/11/2026, segunda-feira, Hoje"');
  });

  it("preserva rótulo e nome acessível do mês", () => {
    const html = renderizar("mes");
    expect(html).toContain('aria-label="Período: Novembro, Este mês"');
    expect(html).toContain(">Novembro</span>");
    expect(html).not.toMatch(/\btruncate\b/);
    expect(html).not.toContain("bg-primary/15");
    expect(html).not.toContain("min-h-11");
  });
});
