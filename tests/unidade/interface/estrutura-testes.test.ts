// Guardrail do contrato visual e da infraestrutura compartilhada dos testes.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function arquivos(diretorio: string, extensoes: string[]): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return arquivos(caminho, extensoes);
    return extensoes.some((extensao) => entrada.name.endsWith(extensao)) ? [caminho] : [];
  });
}

describe("estrutura dos testes de interface", () => {
  it("não mantém exceções de tema no CSS de componentes", () => {
    for (const arquivo of arquivos("src", [".css"])) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toMatch(/html:not\(\.dark\)|html\.light/);
    }
  });

  it("não usa os artefatos visuais removidos", () => {
    for (const arquivo of arquivos("tests", [".ts", ".tsx"])) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toContain("controle-contornado");
      expect(texto, arquivo).not.toContain("paridade-campos");
      expect(texto, arquivo).not.toContain("outline-telas");
    }
  });

  it("mantém a infraestrutura compartilhada dos testes de componente", () => {
    expect(() => readFileSync("tests/apoio/vite.ts", "utf8")).not.toThrow();
    expect(() => readFileSync("tests/apoio/navegador.ts", "utf8")).not.toThrow();
    expect(() => readFileSync("tests/componentes/interface/primitivas.test.ts", "utf8")).not.toThrow();
  });
});
