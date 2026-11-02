import { describe, expect, it } from "vitest";
import { periodoHistoricoDistinto } from "../ponta-a-ponta/movimentacoes/periodo-envio-entradas";

describe("período histórico do teste de envio", () => {
  it.each([
    ["2026-11-01", "2026-06", { de: "2026-10-01", ate: "2026-10-31" }],
    ["2026-07-01", "2026-06", { de: "2026-05-01", ate: "2026-05-31" }],
    ["2027-01-01", "2026-06", { de: "2026-12-01", ate: "2026-12-31" }],
    ["2028-03-01", "2026-06", { de: "2028-02-01", ate: "2028-02-29" }],
    ["2025-03-01", "2026-06", { de: "2025-02-01", ate: "2025-02-28" }],
  ])("usa mês anterior distinto para %s", (referencia, mesEntradas, esperado) => {
    expect(periodoHistoricoDistinto(referencia, mesEntradas)).toEqual(esperado);
  });
});
