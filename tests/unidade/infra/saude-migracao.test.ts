// Confere a saúde da revisão servida com a consulta de schema da migração automática.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/saude/route";

const consultas = vi.hoisted(() => ({ simples: vi.fn(), usuario: vi.fn() }));
vi.mock("@/infra/banco", () => ({
  banco: () => ({ $queryRaw: consultas.simples, usuario: { findUnique: consultas.usuario } }),
}));
vi.mock("@/infra/versao", () => ({ COMMIT: "a".repeat(40), VERSAO: "teste" }));

describe("saúde da revisão após migração automática", () => {
  beforeEach(() => {
    consultas.simples.mockReset().mockResolvedValue([]);
    consultas.usuario.mockReset().mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("mantém a sondagem simples com a migração automática desligada", async () => {
    vi.stubEnv("MIGRACAO_AUTOMATICA", "false");
    expect((await GET()).status).toBe(200);
    expect(consultas.simples).toHaveBeenCalledOnce();
    expect(consultas.usuario).not.toHaveBeenCalled();
  });

  it("consulta o modelo do aplicativo sem expor dados na resposta", async () => {
    vi.stubEnv("MIGRACAO_AUTOMATICA", "true");
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, commit: "a".repeat(40), versao: "teste" });
    expect(consultas.usuario).toHaveBeenCalledOnce();
    expect(consultas.simples).not.toHaveBeenCalled();
  });

  it("recusa a saúde se a consulta ao modelo falhar mesmo com conexão disponível", async () => {
    vi.stubEnv("MIGRACAO_AUTOMATICA", "true");
    consultas.usuario.mockRejectedValueOnce(new Error("detalhe interno sintético"));
    const resposta = await GET();
    expect(resposta.status).toBe(503);
    expect(await resposta.text()).not.toContain("detalhe interno");
  });
});
