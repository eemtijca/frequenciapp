// Executa o worker real em VM para verificar a propriedade dos caches na ativação.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("caches do service worker", () => {
  it("apaga apenas versões reconhecidas próprias, preservando atual e canários", async () => {
    const codigo = readFileSync("public/sw.js", "utf8");
    const versao = codigo.match(/const VERSAO = "([^"]+)"/)?.[1];
    if (!versao) throw new Error("Versão do worker ausente.");
    const atual = `${versao}-estatico`;
    const nomes = new Set([
      atual,
      "frequenciapp-8-estatico",
      "outro-app",
      "frequenciapp-relatorio-estatico",
      "frequenciapp-8-estatico-extra",
      "prefixo-frequenciapp-8-estatico",
    ]);
    const apagar = vi.fn(async (nome: string) => nomes.delete(nome));
    const claim = vi.fn(async () => undefined);
    type Evento = { waitUntil(tarefa: Promise<unknown>): void };
    const eventos = new Map<string, (evento: Evento) => void>();
    runInNewContext(codigo, {
      self: {
        addEventListener(nome: string, acao: (evento: Evento) => void) {
          eventos.set(nome, acao);
        },
        clients: { claim },
      },
      caches: { keys: async () => [...nomes], delete: apagar },
    });
    const ativar = eventos.get("activate");
    if (!ativar) throw new Error("Ativação ausente.");
    let fim: Promise<unknown> = Promise.resolve();
    ativar({
      waitUntil(tarefa) {
        fim = tarefa;
      },
    });
    await fim;
    expect(apagar.mock.calls.map(([nome]) => nome)).toEqual(["frequenciapp-8-estatico"]);
    expect(nomes.has(atual)).toBe(true);
    expect(nomes.has("outro-app")).toBe(true);
    expect(claim).toHaveBeenCalledOnce();
  });
});
