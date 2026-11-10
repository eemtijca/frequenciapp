// Garante que os Caddyfiles público e interno não registrem code nem state
// do retorno OAuth na URI de acesso.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ARQUIVOS = ["infra/servidor/Caddyfile", "infra/servidor/Caddyfile.interno"];

function blocosDaUri(conteudo: string): string[] {
  return [...conteudo.matchAll(/request>uri query \{([\s\S]*?)\}/g)].map(
    (achado) => achado[1] ?? "",
  );
}

describe("logs do Caddy", () => {
  for (const arquivo of ARQUIVOS) {
    it(`redige code e state na URI de ${arquivo}`, () => {
      const conteudo = readFileSync(path.resolve(arquivo), "utf8");
      const blocos = blocosDaUri(conteudo);
      expect(blocos).toHaveLength(2);
      for (const bloco of blocos) {
        expect(bloco).toMatch(/delete\s+code/);
        expect(bloco).toMatch(/delete\s+state/);
      }
      expect(conteudo.match(/format filter\s*\{/g)).toHaveLength(2);
      expect(conteudo.match(/wrap json/g)).toHaveLength(2);
    });
  }
});
