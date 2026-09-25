// Prazos de sessão conforme a escolha de manter conectado no dispositivo.
import { describe, expect, it } from "vitest";
import { duracaoDaSessao } from "@/domain/sessao";

describe("duracaoDaSessao", () => {
  it("lembra por 30 dias", () => {
    expect(duracaoDaSessao(true)).toBe(30 * 24 * 60 * 60 * 1000);
  });
  it("sem lembrar, limita a 12 horas", () => {
    expect(duracaoDaSessao(false)).toBe(12 * 60 * 60 * 1000);
  });
});
