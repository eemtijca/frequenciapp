import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removerReturnDaCopia } from "../../fixtures/atualizacao-offline/controle-negativo";
import config from "../../fixtures/atualizacao-offline/vite.config";

afterEach(() => vi.unstubAllEnvs());

function lerOriginal(caminho: string): string {
  return readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
}

describe("controle negativo offline", () => {
  it("retira somente o return de uma cópia em memória do provider real", () => {
    const caminho = "src/components/atualizacao/contexto-atualizacao.tsx";
    const original = lerOriginal(caminho);
    const copia = removerReturnDaCopia(original);
    expect(copia).not.toBe(original);
    expect(
      copia.replace(
        'avisarInfo("Sem conexão. Os dados atuais continuam na tela.");',
        'avisarInfo("Sem conexão. Os dados atuais continuam na tela.");\n      return;',
      ),
    ).toBe(original);
    expect(lerOriginal(caminho)).toBe(original);
  });

  it("recusa guarda ausente ou repetida", () => {
    expect(() => removerReturnDaCopia("outro código")).toThrow("controle negativo recusado");
    const original = lerOriginal("src/components/atualizacao/contexto-atualizacao.tsx");
    expect(() => removerReturnDaCopia(original + original)).toThrow("controle negativo recusado");
  });

  it("habilita a transformação somente no provider e com a variável explícita", () => {
    const plugin = config.plugins[0];
    if (!plugin) throw new Error("Plugin ausente");
    const caminho = resolve("src/components/atualizacao/contexto-atualizacao.tsx");
    const original = lerOriginal(caminho);
    vi.stubEnv("OFFLINE_CAUSAL_SEM_RETURN", "0");
    expect(plugin.transform(original, caminho)).toBeUndefined();
    vi.stubEnv("OFFLINE_CAUSAL_SEM_RETURN", "1");
    expect(plugin.transform(original, caminho + ".outro")).toBeUndefined();
    expect(plugin.transform(original, caminho)).toBe(removerReturnDaCopia(original));
    expect(lerOriginal(caminho)).toBe(original);
  });
});
