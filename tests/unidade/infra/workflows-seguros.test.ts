// Fronteira estática de confiança: nenhum evento de PR entrega segredos ao código proposto.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (nome: string) => readFileSync(nome, "utf8");

describe("preview sem execução privilegiada de PR", () => {
  it("mantém validação de abertura, sincronização, fork e fechamento sem segredos", () => {
    const fluxo = ler(".github/workflows/schema-preview.yml");
    expect(fluxo).toContain("pull_request:");
    expect(fluxo).not.toMatch(/secrets\.|environment:\s*preview|pull_request_target/);
    expect(fluxo).toContain("persist-credentials: false");
    expect(fluxo).toContain("--ignore-scripts");
    expect(fluxo).not.toMatch(/preview-schema\.mjs (preparar|limpar|faxina)/);
  });

  it("separa a manutenção confiável, sem artefatos ou checkout de branch do PR", () => {
    const fluxo = ler(".github/workflows/schema-preview-confiavel.yml");
    expect(fluxo).not.toMatch(
      /pull_request:|pull_request_target:|workflow_run:|download-artifact|head\.ref|head\.sha/,
    );
    expect(fluxo).toContain("github.ref == 'refs/heads/main'");
    expect(fluxo).toContain("ref: main");
    expect(fluxo).toContain("ref: ${{ vars.PREVIEW_TRUSTED_SHA }}");
    expect(fluxo).toContain("PREVIEW_MANUTENCAO_APROVADA");
    expect(fluxo).not.toContain("preparar --pr");
    expect(fluxo).toMatch(/\^\[0-9a-f\]\{40\}\$/);
    expect(fluxo).toContain("git fetch --no-tags origin");
    expect(fluxo).toContain("git merge-base --is-ancestor");
    expect(fluxo).not.toContain("VERCEL_TOKEN");
    expect(fluxo.indexOf("git merge-base --is-ancestor")).toBeLessThan(
      fluxo.indexOf("DIRECT_URL_PREVIEW"),
    );
  });
});
