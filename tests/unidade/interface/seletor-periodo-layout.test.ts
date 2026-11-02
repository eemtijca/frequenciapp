import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

function renderizar(modo: "dia" | "mes", detalhe?: string) {
  return renderToStaticMarkup(
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
  );
}

describe("gatilho do seletor de período", () => {
  it("permite múltiplas linhas sem truncar texto e mantém a altura mínima", () => {
    const html = renderizar("dia", "segunda-feira");
    const gatilho = html.match(/<button\b[^>]*>/)?.[0] ?? "";
    expect(gatilho).toContain("min-h-11");
    expect(gatilho).toContain("flex-wrap");
    expect(gatilho).not.toMatch(/(?:\s|^)h-11(?:\s|")|\boverflow-hidden\b/);
    expect(html).not.toMatch(/\btruncate\b/);
    expect(html).toContain("02/11/2026");
    expect(html).toContain("seg.");
    expect(html).toContain("segunda-feira");
    expect(html).toContain("Hoje");
    const detalhe = html.match(/<span class="text-muted-foreground [^"]+">/)?.[0] ?? "";
    const selo = html.match(/<span class="bg-primary\/15 [^"]+">/)?.[0] ?? "";
    expect(detalhe).not.toBe("");
    expect(selo).not.toBe("");
    expect(detalhe).not.toMatch(/(?:^|[:\s])hidden(?:\s|")/);
    expect(selo).not.toMatch(/(?:^|[:\s])hidden(?:\s|")/);
    expect(gatilho).toContain('aria-label="Período: 02/11/2026, segunda-feira, Hoje"');
  });

  it("preserva rótulo e nome acessível do mês", () => {
    const html = renderizar("mes");
    expect(html).toContain('aria-label="Período: Novembro, Este mês"');
    expect(html).toContain(">Novembro</span>");
    expect(html).not.toMatch(/\btruncate\b/);
  });
});
