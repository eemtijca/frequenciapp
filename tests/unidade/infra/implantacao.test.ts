// Ordem, exclusão por destino e falhas da implantação com executores sintéticos.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  executorVercel,
  orquestrar,
  prepararAmbienteDeBuild,
  selecionarEvento,
} from "../../../scripts/github/orquestrar-implantacao.mjs";
const sha = "a".repeat(40);
const nomes = ["validar", "build", "migrar", "publicar", "promover", "saude"];

describe("proprietário único de implantação", () => {
  it("serializa eventos intercalados e preserva a revisão em todas as etapas", async () => {
    const ordem: string[] = [];
    await Promise.all(
      ["push", "release", "workflow_dispatch"].map((evento) =>
        orquestrar({
          sha,
          destino: "producao",
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
  it("exige revisão e destino válidos antes do executor mutante", async () => {
    let chamadas = 0;
    await expect(
      orquestrar({
        sha: "curto",
        destino: "producao",
        executar: async () => {
          chamadas++;
        },
      }),
    ).rejects.toThrow("Revisão ou destino");
    expect(chamadas).toBe(0);
  });
  it("aceita main em qualquer momento e tags estáveis", () => {
    expect(selecionarEvento({ evento: "push", ref: "refs/heads/main" })).toBe("main");
    expect(selecionarEvento({ evento: "workflow_dispatch", ref: "refs/heads/main" })).toBe("main");
    expect(selecionarEvento({ evento: "release", ref: "refs/tags/v1.2.3" })).toBe("tag");
    expect(() =>
      selecionarEvento({ evento: "workflow_dispatch", ref: "refs/heads/v1.2.3" }),
    ).toThrow();
  });
  it("remove o dono paralelo e fixa a seção mutante no workflow comum", () => {
    const antigo = readFileSync(".github/workflows/migracoes.yml", "utf8");
    const comum = readFileSync(".github/workflows/implantacao.yml", "utf8");
    expect(antigo).not.toMatch(/db:deploy|migrate deploy|DIRECT_URL_PROD/);
    expect(antigo).toContain("uses: ./.github/workflows/implantacao.yml");
    expect(comum).toContain("group: implantacao-producao");
    expect(comum).toContain("cancel-in-progress: false");
    expect(comum).toContain("node scripts/github/orquestrar-implantacao.mjs");
    expect(comum).not.toContain("IMPLANTACAO_ATESTADO");
    expect(comum).not.toContain("IMPLANTACAO_RELEASES");
  });
  it("mantém o auto-deploy da main desligado no vercel.json", () => {
    const configuracao = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(configuracao.git?.deploymentEnabled?.main).toBe(false);
  });
  it("prepara variáveis descartáveis para o build da Vercel", () => {
    const pasta = mkdtempSync(path.join(os.tmpdir(), "qa-build-vercel-"));
    try {
      prepararAmbienteDeBuild(pasta);
      const conteudo = readFileSync(path.join(pasta, ".env.production.local"), "utf8");
      expect(conteudo).toContain("DATABASE_URL=postgresql://");
      expect(conteudo).toContain("DIRECT_URL=postgresql://");
      expect(conteudo).toMatch(/AUTH_SECRET=.{32,}/);
      expect(conteudo).not.toContain("[SENSITIVE]");
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe("saúde da implantação", () => {
  const ambiente = { GITHUB_SHA: sha, APP_URL: "https://frequencia.exemplo.br" };

  function resposta(status: number, corpo?: unknown) {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => corpo,
    } as unknown as Response;
  }

  function executor(buscar: typeof fetch, esperas: number[] = []) {
    const opcoes = {
      buscar,
      dormir: async (ms: number) => {
        esperas.push(ms);
      },
    } as unknown as Parameters<typeof executorVercel>[1];
    return executorVercel(ambiente, opcoes);
  }

  it("repete a saúde até a revisão promovida", async () => {
    const esperas: number[] = [];
    let chamadas = 0;
    const buscar = (async () => {
      chamadas += 1;
      if (chamadas === 1) return resposta(200, { ok: true, commit: "b".repeat(40) });
      if (chamadas === 2) return resposta(503);
      return resposta(200, { ok: true, commit: sha });
    }) as unknown as typeof fetch;
    await expect(executor(buscar, esperas)("saude")).resolves.toBeUndefined();
    expect(chamadas).toBe(3);
    expect(esperas).toEqual([2000, 4000]);
  });

  it("aceita redirecionamento transitório e erro de rede", async () => {
    const esperas: number[] = [];
    let chamadas = 0;
    const buscar = (async () => {
      chamadas += 1;
      if (chamadas === 1) return resposta(302);
      if (chamadas === 2) throw new TypeError("fetch failed");
      return resposta(200, { ok: true, commit: sha });
    }) as unknown as typeof fetch;
    await expect(executor(buscar, esperas)("saude")).resolves.toBeUndefined();
    expect(chamadas).toBe(3);
    expect(esperas).toEqual([2000, 4000]);
  });

  it("falha após o limite com a última causa", async () => {
    const esperas: number[] = [];
    let chamadas = 0;
    const buscar = (async () => {
      chamadas += 1;
      return resposta(503);
    }) as unknown as typeof fetch;
    await expect(executor(buscar, esperas)("saude")).rejects.toThrow(
      /Saúde indisponível após 6 tentativas \(HTTP 503\)/,
    );
    expect(chamadas).toBe(6);
    expect(esperas).toEqual([2000, 4000, 8000, 16000, 30000]);
  });

  it("não repete proteção por autenticação", async () => {
    const esperas: number[] = [];
    let chamadas = 0;
    const buscar = (async () => {
      chamadas += 1;
      return resposta(401);
    }) as unknown as typeof fetch;
    await expect(executor(buscar, esperas)("saude")).rejects.toThrow(/Deployment Protection/);
    expect(chamadas).toBe(1);
    expect(esperas).toEqual([]);
  });
});
