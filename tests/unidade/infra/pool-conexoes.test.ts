// Pool de conexões: tamanho configurável por ambiente, sem depender de plataforma.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function prepararAmbienteBase() {
  vi.stubEnv("DATABASE_URL", "postgresql://teste:teste@localhost:5432/teste");
  vi.stubEnv("AUTH_SECRET", "segredo-ficticio-com-mais-de-32-caracteres");
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  prepararAmbienteBase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("POOL_MAX_CONEXOES", () => {
  it("usa 10 como padrão", async () => {
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.poolMaxConexoes).toBe(10);
  });

  it("aceita inteiros dentro da faixa", async () => {
    vi.stubEnv("POOL_MAX_CONEXOES", "1");
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.poolMaxConexoes).toBe(1);
  });

  it("recusa valores fora da faixa ou não inteiros", async () => {
    for (const valor of ["0", "101", "abc", "1.5"]) {
      vi.resetModules();
      vi.stubEnv("POOL_MAX_CONEXOES", valor);
      await expect(import("@/infra/ambiente")).rejects.toThrow("Configuração de ambiente inválida");
    }
  });
});
