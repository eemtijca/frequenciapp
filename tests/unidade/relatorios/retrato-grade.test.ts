// Validação do retrato da Grade e garantia do nível de isolamento.
// O ambiente é preenchido antes do import dinâmico: as entradas inválidas
// não abrem conexão com o banco.
import { beforeAll, describe, expect, it } from "vitest";

const UUID = "00000000-0000-4000-8000-000000000000";
let opcoes: { isolationLevel: string; timeout: number };
let obterRetratoGrade: (entrada: {
  turmaOriginalId: string;
  de: string;
  ate: string;
}) => Promise<unknown>;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://frequencia:frequencia@localhost:5432/frequencia";
  process.env.AUTH_SECRET ??= "x".repeat(32);
  const modulo = await import("@/application/relatorio-grade");
  opcoes = modulo.OPCOES_TRANSACAO_RETRATO;
  obterRetratoGrade = modulo.obterRetratoGrade;
});

async function invalidar(entrada: { turmaOriginalId: string; de: string; ate: string }) {
  await expect(obterRetratoGrade(entrada)).rejects.toMatchObject({ status: 400 });
}

describe("obterRetratoGrade", () => {
  it("usa RepeatableRead e tempo limite explícito", () => {
    expect(opcoes).toEqual({
      isolationLevel: "RepeatableRead",
      timeout: 30_000,
    });
  });

  it("recusa turma e datas inválidas antes de abrir o banco", async () => {
    await invalidar({ turmaOriginalId: "turma", de: "2026-09-10", ate: "2026-09-10" });
    await invalidar({ turmaOriginalId: UUID, de: "2026-09-31", ate: "2026-09-31" });
    await invalidar({ turmaOriginalId: UUID, de: "2026-09-10", ate: "2026-09-09" });
    await invalidar({ turmaOriginalId: UUID, de: "2024-01-01", ate: "2025-12-31" });
    await invalidar({ turmaOriginalId: UUID, de: "2999-01-01", ate: "2999-01-31" });
  });
});
