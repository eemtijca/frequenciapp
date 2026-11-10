// Ordem, exclusão por destino e falhas da implantação com executores sintéticos.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { orquestrar, selecionarEvento } from "../../../scripts/github/orquestrar-implantacao.mjs";
const sha = "a".repeat(40);
const atestado = {
  sha,
  destino: "producao",
  backupVerificado: true,
  recuperacaoVerificada: true,
  migracoesExpansivas: true,
  autoDeployCoordenado: true,
};
const nomes = ["validar", "build", "migrar", "publicar", "promover", "saude"];

describe("proprietário único de implantação", () => {
  it("serializa eventos intercalados e preserva a revisão em todas as etapas", async () => {
    const ordem: string[] = [];
    await Promise.all(
      ["push", "release", "workflow_dispatch"].map((evento) =>
        orquestrar({
          sha,
          destino: "producao",
          atestado,
          executar: async (etapa: string, revisao: string) => {
            expect(revisao).toBe(sha);
            ordem.push(`${evento}:${etapa}`);
            await Promise.resolve();
          },
        }),
      ),
    );
    expect(ordem).toEqual(
      ["push", "release", "workflow_dispatch"].flatMap((e) => nomes.map((n) => `${e}:${n}`)),
    );
  });
  it.each(nomes)("interrompe a sequência em %s sem repetir mutação", async (falha) => {
    const ordem: string[] = [];
    const promessa = orquestrar({
      sha,
      destino: "producao",
      atestado,
      executar: async (etapa: string) => {
        ordem.push(etapa);
        if (etapa === falha) throw new Error("Falha sintética");
      },
    });
    await expect(promessa).rejects.toThrow(
      nomes.indexOf(falha) >= 2 ? "schema pode já ter sido aplicado" : "antes da migração",
    );
    expect(ordem).toEqual(nomes.slice(0, nomes.indexOf(falha) + 1));
  });
  it("não executa sem backup, recuperação, expansão e coordenação atestados para o SHA", async () => {
    for (const campo of [
      "sha",
      "backupVerificado",
      "recuperacaoVerificada",
      "migracoesExpansivas",
      "autoDeployCoordenado",
    ]) {
      let chamadas = 0;
      await expect(
        orquestrar({
          sha,
          destino: "producao",
          atestado: { ...atestado, [campo]: false },
          executar: async () => {
            chamadas++;
          },
        }),
      ).rejects.toThrow();
      expect(chamadas).toBe(0);
    }
  });
  it("aceita somente tag estável, nunca a main ou uma branch homônima", () => {
    expect(selecionarEvento({ evento: "release", ref: "refs/tags/v1.2.3" })).toBe("tag");
    expect(selecionarEvento({ evento: "workflow_dispatch", ref: "refs/tags/v1.2.3" })).toBe("tag");
    expect(() => selecionarEvento({ evento: "push", ref: "refs/heads/main" })).toThrow(
      "Evento fora do regime",
    );
    expect(() =>
      selecionarEvento({ evento: "workflow_dispatch", ref: "refs/heads/v1.2.3" }),
    ).toThrow("Evento fora do regime");
  });
  it("remove o dono paralelo e fixa a seção mutante no workflow comum", () => {
    const antigo = readFileSync(".github/workflows/migracoes.yml", "utf8");
    const comum = readFileSync(".github/workflows/implantacao.yml", "utf8");
    expect(antigo).not.toMatch(/db:deploy|migrate deploy|DIRECT_URL_PROD/);
    expect(antigo).toContain("uses: ./.github/workflows/implantacao.yml");
    expect(comum).toContain("group: implantacao-producao");
    expect(comum).toContain("cancel-in-progress: false");
    expect(comum).toContain("node scripts/github/orquestrar-implantacao.mjs");
    expect(comum).not.toMatch(/^\s*push:/m);
    expect(comum).not.toContain("IMPLANTACAO_RELEASES");
  });
});
