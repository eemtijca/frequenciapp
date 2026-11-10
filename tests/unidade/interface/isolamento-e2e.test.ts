// Guarda de isolamento da suíte E2E: confirmação explícita e hosts sintéticos.
import { describe, expect, it } from "vitest";
import { exigirAmbienteE2E } from "../../ponta-a-ponta/helpers/isolamento";

const BANCO = "postgresql://frequencia:frequencia@localhost:5432/frequencia";
const BASE = "http://localhost:3000";

function ambiente(
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    E2E_BANCO_SINTETICO: "true",
    DATABASE_URL: BANCO,
    DIRECT_URL: BANCO,
    TEST_BASE_URL: BASE,
    ...extra,
  };
}

describe("isolamento da suíte E2E", () => {
  it("exige a confirmação explícita antes de qualquer conexão", () => {
    expect(() => exigirAmbienteE2E(ambiente({ E2E_BANCO_SINTETICO: undefined }))).toThrow(
      /E2E_BANCO_SINTETICO/,
    );
    expect(() => exigirAmbienteE2E(ambiente({ E2E_BANCO_SINTETICO: "false" }))).toThrow(
      /E2E_BANCO_SINTETICO/,
    );
  });

  it("recusa configuração ausente ou divergente", () => {
    expect(() => exigirAmbienteE2E(ambiente({ DATABASE_URL: undefined }))).toThrow(/DATABASE_URL/);
    expect(() =>
      exigirAmbienteE2E(
        ambiente({ DIRECT_URL: "postgresql://frequencia:frequencia@localhost:5432/outro" }),
      ),
    ).toThrow(/mesmo banco/);
  });

  it("recusa banco ou aplicação fora do host sintético", () => {
    expect(() =>
      exigirAmbienteE2E(
        ambiente({
          DATABASE_URL: "postgresql://frequencia:frequencia@db.exemplo.com:5432/frequencia",
          DIRECT_URL: "postgresql://frequencia:frequencia@db.exemplo.com:5432/frequencia",
        }),
      ),
    ).toThrow(/serviço db/);
    expect(() =>
      exigirAmbienteE2E(ambiente({ TEST_BASE_URL: "https://frequencia.exemplo.com" })),
    ).toThrow(/serviço app/);
  });

  it("aceita banco e aplicação locais ou no serviço do Compose", () => {
    expect(() => exigirAmbienteE2E(ambiente())).not.toThrow();
    expect(() =>
      exigirAmbienteE2E(
        ambiente({
          DATABASE_URL: "postgresql://frequencia:frequencia@db:5432/frequencia",
          DIRECT_URL: "postgresql://frequencia:frequencia@db:5432/frequencia",
          TEST_BASE_URL: "http://app:3000",
        }),
      ),
    ).not.toThrow();
  });
});
