// Bootstrap do administrador: criar quando falta e preservar no modo
// --somente-criar quando a conta já existe.
import { describe, expect, it } from "vitest";
import { deveGravarAdmin } from "../../scripts/decisao-admin.mjs";

describe("deveGravarAdmin", () => {
  it("grava quando a conta não existe", () => {
    expect(deveGravarAdmin({ existe: false, somenteCriar: false })).toBe(true);
    expect(deveGravarAdmin({ existe: false, somenteCriar: true })).toBe(true);
  });

  it("preserva a conta existente no modo somente criar", () => {
    expect(deveGravarAdmin({ existe: true, somenteCriar: true })).toBe(false);
  });

  it("atualiza a conta existente fora do modo somente criar", () => {
    expect(deveGravarAdmin({ existe: true, somenteCriar: false })).toBe(true);
  });
});
