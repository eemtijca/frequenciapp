// Domínio de usuários: política de senha, rótulos de exibição e capacidades.
import { describe, expect, it } from "vitest";
import {
  primeiroNome,
  problemaDeSenha,
  rotuloDePapel,
  temCapacidade,
  type Papel,
} from "@/domain/usuarios";

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
    expect(rotuloDePapel("ADMIN")).toBe("Administração");
    expect(rotuloDePapel("COORDENACAO")).toBe("Coordenação");
    expect(rotuloDePapel("DIRETOR_TURMA")).toBe("Diretor de turma");
  });
});

describe("temCapacidade", () => {
  it("dá à administração a operação, a gestão e a troca de senha", () => {
    expect(temCapacidade("ADMIN", "operar")).toBe(true);
    expect(temCapacidade("ADMIN", "administrar")).toBe(true);
    expect(temCapacidade("ADMIN", "alterarPropriaSenha")).toBe(true);
  });

  it("dá à coordenação a operação e a troca de senha, sem a gestão", () => {
    expect(temCapacidade("COORDENACAO", "operar")).toBe(true);
    expect(temCapacidade("COORDENACAO", "alterarPropriaSenha")).toBe(true);
    expect(temCapacidade("COORDENACAO", "administrar")).toBe(false);
  });

  it("dá ao diretor de turma só a leitura das estatísticas e a troca de senha", () => {
    expect(temCapacidade("DIRETOR_TURMA", "verEstatisticasDasTurmas")).toBe(true);
    expect(temCapacidade("DIRETOR_TURMA", "alterarPropriaSenha")).toBe(true);
    expect(temCapacidade("DIRETOR_TURMA", "operar")).toBe(false);
    expect(temCapacidade("DIRETOR_TURMA", "administrar")).toBe(false);
    expect(temCapacidade("COORDENACAO", "verEstatisticasDasTurmas")).toBe(false);
  });

  it("recusa papel desconhecido vindo de dado inesperado", () => {
    const desconhecido = "VISITANTE" as unknown as Papel;
    expect(temCapacidade(desconhecido, "operar")).toBe(false);
    expect(temCapacidade(desconhecido, "administrar")).toBe(false);
  });
});
