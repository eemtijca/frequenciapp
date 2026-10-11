// Escopos e segredos do BI: limites de recurso e período e chaves sem recuperação.
import { describe, expect, it } from "vitest";
import {
  esquemaEscopoBi,
  esquemaDiaBi,
  estadoChaveBi,
  periodoBi,
  recursoPermitidoBi,
} from "@/domain/bi";
import { hashChaveBi, novaChaveBi } from "@/infra/chave-bi";
import { esquemaAcaoChaveBi } from "@/domain/bi";

describe("contratos do FrequenciBI", () => {
  it("gera segredos independentes com 256 bits e armazena somente SHA-256", () => {
    const a = novaChaveBi();
    const b = novaChaveBi();
    expect(a.segredo).toMatch(/^fbi_[A-Za-z0-9_-]{43}$/);
    expect(a.segredo).not.toBe(b.segredo);
    expect(a.segredoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashChaveBi(a.segredo)).toBe(a.segredoHash);
    expect(a.segredoHash).not.toContain(a.segredo);
  });
  it("a restrição de bases recusa recursos fora do escopo e uma lista vazia recusa todos", () => {
    expect(recursoPermitidoBi({ recursos: ["faltas"] }, "alunos")).toBe(false);
    expect(recursoPermitidoBi({ recursos: ["faltas"] }, "faltas")).toBe(true);
    expect(recursoPermitidoBi({ recursos: [] }, "faltas")).toBe(false);
    expect(recursoPermitidoBi({}, "faltas")).toBe(true);
  });
  it("intersecta os períodos e nunca permite ampliar a validade escolar", () => {
    expect(
      periodoBi({ inicio: "2026-03-01", fim: "2026-10-31" }, "2020-01-01", "2090-01-01"),
    ).toEqual({ inicio: "2026-03-01", fim: "2026-10-31", vazio: false });
    expect(periodoBi({ inicio: "2026-03-01" }, undefined, "2026-02-01").vazio).toBe(true);
    expect(periodoBi({}, "2026-04-01", "2026-04-30").inicio).toBe("2026-04-01");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-01-00", "1/2/2026"])(
    "recusa a data civil %s",
    (data) => expect(esquemaDiaBi.safeParse(data).success).toBe(false),
  );
  it("aceita ano bissexto e recusa período invertido ou dados estranhos", () => {
    expect(esquemaDiaBi.safeParse("2024-02-29").success).toBe(true);
    expect(esquemaEscopoBi.safeParse({ inicio: "2026-03-01", fim: "2026-01-01" }).success).toBe(
      false,
    );
    expect(esquemaEscopoBi.safeParse({ recursos: ["usuarios"] }).success).toBe(false);
    expect(esquemaEscopoBi.safeParse({ turmas: ["qualquer"] }).success).toBe(false);
    expect(esquemaEscopoBi.safeParse({ senhaHash: "nao" }).success).toBe(false);
  });
  it("a revogação prevalece sobre a validade, inclusive no instante de expiração", () => {
    const agora = new Date("2026-04-01T12:00:00Z");
    expect(estadoChaveBi({ revogadaEm: agora, expiraEm: null }, agora)).toBe("revogada");
    expect(estadoChaveBi({ revogadaEm: null, expiraEm: agora }, agora)).toBe("expirada");
    expect(estadoChaveBi({ revogadaEm: null, expiraEm: null }, agora)).toBe("ativa");
  });
  it("todas as ações sensíveis precisam de senha e desconhecidos são recusados", () => {
    for (const acao of ["criar", "editar", "rotacionar", "revogar", "revogar-todas", "limpar"])
      expect(esquemaAcaoChaveBi.safeParse({ acao }).success).toBe(false);
    expect(esquemaAcaoChaveBi.safeParse({ acao: "revelar", senha: "teste" }).success).toBe(false);
  });
});
