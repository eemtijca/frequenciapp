// Automação do schema de preview: nomes, conta sintética e decisão da faxina.
import { describe, expect, it } from "vitest";
import { emailDaConta, nomeDoSchema, schemasParaRemover } from "../../scripts/preview-schema.mjs";

describe("schema de preview por pull request", () => {
  it("nomeia e valida o número do pull request", () => {
    expect(nomeDoSchema(125)).toBe("preview_pr_125");
    expect(nomeDoSchema("42")).toBe("preview_pr_42");
    for (const valor of [0, -1, 1.5, "abc", undefined]) {
      expect(() => nomeDoSchema(valor)).toThrow("O número do pull request é inválido");
    }
  });

  it("deriva o e-mail da conta sintética", () => {
    expect(emailDaConta(42)).toBe("preview-pr-42@escola.exemplo");
  });

  it("remove apenas schemas de preview sem pull request aberto", () => {
    const existentes = ["preview_pr_1", "preview_pr_2", "preview", "public", "preview_pr_10"];
    expect(schemasParaRemover(existentes, [2, 10])).toEqual(["preview_pr_1"]);
    expect(schemasParaRemover(existentes, [1, 2, 10])).toEqual([]);
  });
});
