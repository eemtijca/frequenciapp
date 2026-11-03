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
      if (arquivo.endsWith("estrutura-testes.test.ts")) continue;
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toContain("controle-contornado");
      expect(texto, arquivo).not.toContain("paridade-campos");
      expect(texto, arquivo).not.toContain("outline-telas");
    }
  });

  it("não usa opacidade manual para desabilitar controles", () => {
    for (const arquivo of arquivos("src/components", [".tsx", ".css"])) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toMatch(
        /disabled:opacity-|peer-disabled:opacity-|group-data-\[disabled=true\]:opacity-/,
      );
    }
  });

  it("reserva bordas transparentes para peças internas justificadas", () => {
    // Blocos internos do seletor de turmas usam o anel de seleção; marcas de
    // presença usam a borda transparente como espaçamento, não como controle.
    const excecoes = new Set([
      "src/components/chamada/seletor-turma-chamada.module.css",
      "src/components/chamada/vista-frequencia.module.css",
    ]);
    for (const arquivo of arquivos("src/components", [".css"])) {
      const relativo = arquivo.replaceAll("\\", "/");
      const texto = readFileSync(arquivo, "utf8");
      if (/border(?:-color)?:\s*(?:1px solid )?transparent/.test(texto)) {
        expect(excecoes.has(relativo), relativo).toBe(true);
      }
    }
  });

  it("mantém a infraestrutura compartilhada dos testes de componente", () => {
    expect(() => readFileSync("tests/apoio/vite.ts", "utf8")).not.toThrow();
    expect(() => readFileSync("tests/apoio/navegador.ts", "utf8")).not.toThrow();
    expect(() =>
      readFileSync("tests/componentes/interface/primitivas.test.ts", "utf8"),
    ).not.toThrow();
  });
});
