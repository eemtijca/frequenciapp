// Contrato da identidade de banco entre runtime, migração e backup.
import { describe, expect, it } from "vitest";
import { validarIdentidadeBanco } from "../../../scripts/servidor/validar-banco.mjs";

const BASE = "postgresql://frequencia:frequencia@localhost:5432/frequencia";

describe("identidade do banco", () => {
  it("aceita a mesma base nas URLs de runtime, migração e backup", () => {
    const resultado = validarIdentidadeBanco({
      DATABASE_URL: BASE,
      DIRECT_URL: "postgresql://frequencia:frequencia@pooler:5432/frequencia",
      BACKUP_DATABASE_URL: BASE,
    });
    expect(resultado).toMatchObject({ database: "frequencia", schema: "public" });
    expect(resultado.avisos).toHaveLength(1);
  });

  it("recusa banco ou schema divergente", () => {
    expect(() =>
      validarIdentidadeBanco({
        DATABASE_URL: BASE,
        DIRECT_URL: "postgresql://frequencia:frequencia@localhost:5432/outro",
      }),
    ).toThrow(/outro banco/);
    expect(() =>
      validarIdentidadeBanco({
        DATABASE_URL: BASE,
        BACKUP_DATABASE_URL:
          "postgresql://frequencia:frequencia@localhost:5432/frequencia?schema=preview",
      }),
    ).toThrow(/outro schema/);
  });

  it("respeita o schema explícito e exige ao menos uma URL", () => {
    expect(
      validarIdentidadeBanco({
        DATABASE_URL: `${BASE}?schema=public`,
        DIRECT_URL: `${BASE}?schema=ignorado`,
        DATABASE_SCHEMA: "public",
      }),
    ).toMatchObject({ schema: "public" });
    expect(() => validarIdentidadeBanco({})).toThrow(/DATABASE_URL/);
  });
});
