// Ordem pura da base histórica: criação decrescente e identificador crescente.
import { expect, it } from "vitest";
import { ORDEM_BASE_CHAMADA, compararBases, escolherBase } from "@/domain/base-chamada";
it("compartilha a ordem estável aceita pelas consultas", () => {
  expect(ORDEM_BASE_CHAMADA).toEqual([{ criadoEm: "desc" }, { id: "asc" }]);
});
it("escolhe a chamada criada por último e desempata pelo identificador", () => {
  expect(
    escolherBase([
      { id: "b", criadoEm: new Date(200) },
      { id: "a", criadoEm: new Date(200) },
      { id: "c", criadoEm: new Date(100) },
    ]),
  ).toEqual({ id: "a", criadoEm: new Date(200) });
  expect(
    compararBases({ id: "b", criadoEm: new Date(200) }, { id: "a", criadoEm: new Date(200) }),
  ).toBe(1);
});
