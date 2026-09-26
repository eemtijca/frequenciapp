// Configuração de ambiente: leitura de booleanos e regra do cookie Secure.
import { describe, expect, it } from "vitest";
import { booleanoDeAmbiente, cookiesSegurosDe } from "@/infra/booleano";

describe("booleanoDeAmbiente", () => {
  it("reconhece valores verdadeiros e falsos", () => {
    expect(booleanoDeAmbiente("true", false)).toBe(true);
    expect(booleanoDeAmbiente("TRUE", false)).toBe(true);
    expect(booleanoDeAmbiente("1", false)).toBe(true);
    expect(booleanoDeAmbiente("sim", false)).toBe(true);
    expect(booleanoDeAmbiente("false", true)).toBe(false);
    expect(booleanoDeAmbiente("0", true)).toBe(false);
    expect(booleanoDeAmbiente("nao", true)).toBe(false);
  });
  it("usa o padrão quando ausente, vazio ou desconhecido", () => {
    expect(booleanoDeAmbiente(undefined, true)).toBe(true);
    expect(booleanoDeAmbiente("", true)).toBe(true);
    expect(booleanoDeAmbiente("talvez", false)).toBe(false);
    expect(booleanoDeAmbiente("talvez", true)).toBe(true);
  });
});

describe("cookiesSegurosDe", () => {
  it("marca Secure apenas em produção sem HTTP liberado", () => {
    expect(cookiesSegurosDe(true, false)).toBe(true);
    expect(cookiesSegurosDe(true, true)).toBe(false);
    expect(cookiesSegurosDe(false, false)).toBe(false);
    expect(cookiesSegurosDe(false, true)).toBe(false);
  });
});
