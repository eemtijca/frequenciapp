// Domínio de usuários: política de senha e rótulos de exibição.
import { describe, expect, it } from "vitest";
import { primeiroNome, problemaDeSenha, rotuloDePapel } from "@/domain/usuarios";

describe("problemaDeSenha", () => {
  it("aprova senhas dentro da política", () => {
    expect(problemaDeSenha("DemoFrequencia2026")).toBe(null);
    expect(problemaDeSenha("a1b2c3d4")).toBe(null);
    expect(problemaDeSenha("Trocar@123")).toBe(null);
  });
  it("recusa senhas curtas", () => {
    expect(problemaDeSenha("abc123")).toBe("A senha deve ter ao menos 8 caracteres.");
    expect(problemaDeSenha("")).toBe("A senha deve ter ao menos 8 caracteres.");
  });
  it("recusa senha sem letra", () => {
    expect(problemaDeSenha("12345678")).toBe("A senha deve conter ao menos uma letra.");
  });
  it("recusa senha sem número", () => {
    expect(problemaDeSenha("abcdefghi")).toBe("A senha deve conter ao menos um número.");
  });
  it("recusa senha exageradamente longa", () => {
    expect(problemaDeSenha("a1".repeat(150))).toBe("A senha deve ter no máximo 200 caracteres.");
  });
  it("aceita letras acentuadas", () => {
    expect(problemaDeSenha("Sérgio2026")).toBe(null);
  });
});

describe("primeiroNome", () => {
  it("devolve o primeiro termo do nome", () => {
    expect(primeiroNome("Maria da Silva")).toBe("Maria");
    expect(primeiroNome("Ana")).toBe("Ana");
  });
  it("lida com espaços extras", () => {
    expect(primeiroNome("  João   Pedro ")).toBe("João");
  });
});

describe("rotuloDePapel", () => {
  it("traduz os papéis", () => {
    expect(rotuloDePapel("ADMIN")).toBe("Administrador");
    expect(rotuloDePapel("PROFESSOR")).toBe("Professor(a)");
  });
});
