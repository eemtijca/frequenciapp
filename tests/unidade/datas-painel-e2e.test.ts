import { describe, expect, it } from "vitest";
import { datasDoPainel } from "../ponta-a-ponta/relatorios/datas-painel";

describe("datas da fixture diária do Painel", () => {
  it.each([
    ["2026-11-01", ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]],
    ["2027-01-01", ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10"]],
    ["2028-03-01", ["2028-02-07", "2028-02-08", "2028-02-09", "2028-02-10"]],
    ["2027-05-20", ["2027-04-05", "2027-04-06", "2027-04-07", "2027-04-08"]],
  ])("seleciona segunda a quinta em mês histórico para %s", (hoje, esperado) => {
    expect(datasDoPainel(hoje)).toEqual(esperado);
  });
});
