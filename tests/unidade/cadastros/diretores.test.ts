// Domínio dos diretores de turma: identificador, palavra-chave, estado da
// credencial, vínculos no tempo e categorias visíveis.
import { describe, expect, it } from "vitest";
import {
  categoriasValidas,
  credencialPermiteEntrada,
  estadoDaCredencial,
  formatarPalavraChave,
  mensagemDeCredencialRecusada,
  problemaDeIdentificador,
  recortarAoVinculo,
  vinculoVigente,
} from "@/domain/diretores";
import { gerarPalavraChave } from "@/infra/auth/palavra-chave";

const AGORA = new Date("2026-09-27T15:00:00Z");

describe("problemaDeIdentificador", () => {
  it("aceita minúsculas, números, ponto e hífen", () => {
    expect(problemaDeIdentificador("3a-maria")).toBeNull();
    expect(problemaDeIdentificador("prof.joao2")).toBeNull();
  });

  it("recusa arroba, maiúscula, acento, espaço e tamanho fora da faixa", () => {
    expect(problemaDeIdentificador("maria@escola")).not.toBeNull();
    expect(problemaDeIdentificador("Maria")).not.toBeNull();
    expect(problemaDeIdentificador("joão")).not.toBeNull();
    expect(problemaDeIdentificador("ana maria")).not.toBeNull();
    expect(problemaDeIdentificador("ab")).not.toBeNull();
    expect(problemaDeIdentificador("a".repeat(41))).not.toBeNull();
    expect(problemaDeIdentificador("-ana")).not.toBeNull();
  });
});

describe("palavra-chave", () => {
  it("agrupa em blocos de quatro", () => {
    expect(formatarPalavraChave("abcd2345efgh")).toBe("abcd-2345-efgh");
  });

  it("gera palavras distintas, sem caracteres ambíguos e com letra e número", () => {
    const geradas = new Set(Array.from({ length: 200 }, () => gerarPalavraChave()));
    expect(geradas.size).toBe(200);
    for (const palavra of geradas) {
      expect(palavra).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(palavra).not.toMatch(/[01ilo]/);
      expect(palavra).toMatch(/[a-z]/);
      expect(palavra).toMatch(/[0-9]/);
    }
  });
});

describe("estadoDaCredencial", () => {
  const valida = {
    expiraEm: "2026-12-26T15:00:00Z",
    revogadaEm: null,
    trocaObrigatoria: false,
  };

  it("percorre o ciclo de vida", () => {
    expect(estadoDaCredencial(null, AGORA)).toBe("sem_palavra");
    expect(estadoDaCredencial({ ...valida, trocaObrigatoria: true }, AGORA)).toBe("emitida");
    expect(estadoDaCredencial(valida, AGORA)).toBe("em_uso");
    expect(estadoDaCredencial({ ...valida, expiraEm: "2026-09-27T15:00:00Z" }, AGORA)).toBe(
      "expirada",
    );
  });

  it("dá precedência à revogação sobre a validade", () => {
    const revogada = { ...valida, expiraEm: "2026-01-01T00:00:00Z", revogadaEm: "2025-12-01" };
    expect(estadoDaCredencial(revogada, AGORA)).toBe("revogada");
  });

  it("só deixa entrar com palavra emitida ou em uso", () => {
    expect(credencialPermiteEntrada("emitida")).toBe(true);
    expect(credencialPermiteEntrada("em_uso")).toBe(true);
    expect(credencialPermiteEntrada("expirada")).toBe(false);
    expect(credencialPermiteEntrada("revogada")).toBe(false);
    expect(credencialPermiteEntrada("sem_palavra")).toBe(false);
    expect(mensagemDeCredencialRecusada("expirada")).toContain("vencida");
    expect(mensagemDeCredencialRecusada("revogada")).toContain("encerrado");
  });
});

describe("vínculos no tempo", () => {
  const vinculo = { inicio: "2026-03-01", fim: "2026-06-30" };

  it("vale de início a fim, inclusive", () => {
    expect(vinculoVigente(vinculo, "2026-03-01")).toBe(true);
    expect(vinculoVigente(vinculo, "2026-06-30")).toBe(true);
    expect(vinculoVigente(vinculo, "2026-07-01")).toBe(false);
    expect(vinculoVigente({ inicio: "2026-03-01", fim: null }, "2027-01-01")).toBe(true);
  });

  it("recorta o período pedido ao vínculo", () => {
    expect(recortarAoVinculo(vinculo, "2026-01-01", "2026-12-31")).toEqual({
      de: "2026-03-01",
      ate: "2026-06-30",
    });
    expect(recortarAoVinculo(vinculo, "2026-04-01", "2026-04-30")).toEqual({
      de: "2026-04-01",
      ate: "2026-04-30",
    });
    expect(recortarAoVinculo(vinculo, "2026-07-01", "2026-07-31")).toBeNull();
  });
});

describe("categoriasValidas", () => {
  it("mantém as faltas, ordena e descarta o desconhecido", () => {
    expect(categoriasValidas(["saidas", "notas"])).toEqual(["faltas", "saidas"]);
    expect(categoriasValidas([])).toEqual(["faltas"]);
  });
});
