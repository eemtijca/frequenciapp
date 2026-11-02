import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import playwright from "../../../playwright.outline-telas-dialogos.config";
import vite from "../../fixtures/outline-telas-dialogos/vite.config";

describe("artefatos dos testes visuais de diálogos", () => {
  it("mantém os arquivos gerados nas pastas locais já ignoradas", () => {
    expect(vite.cacheDir).toBe(resolve(process.cwd(), "node_modules/.vite-outline-telas-dialogos"));
    expect(playwright.outputDir).toBe("test-results/outline-telas-dialogos-verificacao");
  });
});
