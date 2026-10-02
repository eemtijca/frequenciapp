// Cobertura dos envios da frequência: um sucesso de outro período não elimina
// dias pendentes, e qualquer edição posterior exige uma nova conferência.
import { describe, expect, it } from "vitest";
import {
  diasSemEnvioConfirmado,
  type ChamadaParaEnvio,
  type EnvioConfirmadoDaFrequencia,
} from "@/domain/planilha-envios";

const ANTES = new Date("2026-06-20T13:00:00Z");
const DEPOIS = new Date("2026-06-20T13:00:01Z");
const APOS_ENVIO = new Date("2026-06-20T13:00:02Z");

function chamada(dia: string, atualizadoEm = ANTES): ChamadaParaEnvio {
  return { dia: new Date(`${dia}T12:00:00Z`), atualizadoEm };
}

function envio(de: string, ate = de, criadoEm = DEPOIS): EnvioConfirmadoDaFrequencia {
  return { de: new Date(`${de}T12:00:00Z`), ate: new Date(`${ate}T12:00:00Z`), criadoEm };
}

describe("dias sem envio confirmado", () => {
  it("mantém um dia anterior quando o sucesso cobre somente outra chamada", () => {
    expect(
      diasSemEnvioConfirmado([chamada("2026-06-15"), chamada("2026-06-16")], [envio("2026-06-16")]),
    ).toEqual(["2026-06-15"]);
  });

  it("mantém um mês anterior apesar de um sucesso recente em outro mês", () => {
    expect(
      diasSemEnvioConfirmado([chamada("2026-05-15")], [envio("2026-06-01", "2026-06-30")]),
    ).toEqual(["2026-05-15"]);
  });

  it("confirma todas as chamadas do período, incluindo os dois limites", () => {
    expect(
      diasSemEnvioConfirmado(
        [chamada("2026-06-15"), chamada("2026-06-16"), chamada("2026-06-17")],
        [envio("2026-06-15", "2026-06-17")],
      ),
    ).toEqual([]);
  });

  it("mantém a edição posterior à referência do envio", () => {
    expect(
      diasSemEnvioConfirmado([chamada("2026-06-15", APOS_ENVIO)], [envio("2026-06-15")]),
    ).toEqual(["2026-06-15"]);
  });

  it("mantém o dia quando não é possível ordenar a edição e a leitura", () => {
    expect(diasSemEnvioConfirmado([chamada("2026-06-15", DEPOIS)], [envio("2026-06-15")])).toEqual([
      "2026-06-15",
    ]);
  });

  it("confirma uma edição após um novo sucesso do mesmo dia", () => {
    expect(
      diasSemEnvioConfirmado(
        [chamada("2026-06-15", APOS_ENVIO)],
        [envio("2026-06-15"), envio("2026-06-15", "2026-06-15", new Date("2026-06-20T13:00:03Z"))],
      ),
    ).toEqual([]);
  });

  it("mantém o dia se qualquer turma atual da origem tiver edição não enviada", () => {
    expect(
      diasSemEnvioConfirmado(
        [chamada("2026-06-15"), chamada("2026-06-15", APOS_ENVIO)],
        [envio("2026-06-15")],
      ),
    ).toEqual(["2026-06-15"]);
  });

  it("sem sucesso anterior, devolve os dias ordenados sem repetir a mesma data", () => {
    expect(
      diasSemEnvioConfirmado(
        [chamada("2026-06-16"), chamada("2026-06-15"), chamada("2026-06-15")],
        [],
      ),
    ).toEqual(["2026-06-15", "2026-06-16"]);
  });
});
