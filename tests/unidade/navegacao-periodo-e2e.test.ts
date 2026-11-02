import { describe, expect, it } from "vitest";
import {
  deslocamentoMes,
  navegarMeses,
  validarDiaCivil,
} from "../ponta-a-ponta/helpers/navegacao-periodo";
import { mesSeguinte } from "@/domain/frequencia";

describe("navegação civil de períodos", () => {
  it.each(["0099-12", "0999-12", "9999-12"])(
    "recusa %s como origem ou destino antes de mover o seletor",
    async (historico) => {
      let cliques = 0;
      const mover = async () => {
        cliques++;
      };
      await expect(navegarMeses(async () => "2026-01", mover, historico)).rejects.toThrow(
        /1000.*9999/,
      );
      await expect(navegarMeses(async () => historico, mover, "2026-01")).rejects.toThrow(
        /1000.*9999/,
      );
      expect(cliques).toBe(0);
    },
  );

  it("alcança agosto de 2026 a partir de setembro de 2029 sem limite de 36 meses", () => {
    expect(deslocamentoMes("2029-09", "2026-08")).toBe(-37);
  });
  it("mantém a matemática civil independente da faixa do seletor", () => {
    expect(deslocamentoMes("0001-01", "0001-02")).toBe(1);
    expect(deslocamentoMes("0099-12", "0100-01")).toBe(1);
    expect(deslocamentoMes("0999-12", "1000-01")).toBe(1);
    expect(deslocamentoMes("9999-11", "9999-12")).toBe(1);
  });
  it("percorre 49 meses até a fixture de junho de 2026", async () => {
    let atual = "2030-07";
    let cliques = 0;
    await navegarMeses(
      async () => atual,
      async (direcao) => {
        atual = mesSeguinte(atual, direcao);
        cliques++;
      },
      "2026-06",
    );
    expect(atual).toBe("2026-06");
    expect(cliques).toBe(49);
  });
  it("aceita o dia 29 bissexto e rejeita o mesmo dia em ano comum", () => {
    expect(() => validarDiaCivil("2028-02-29")).not.toThrow();
    expect(() => validarDiaCivil("2027-02-29")).toThrow("inválido");
  });

  it.each([
    ["1000-02", "1000-01", 1],
    ["9999-10", "9999-11", 1],
    ["1001-01", "1000-01", 12],
    ["2029-09", "2026-08", 37],
    ["2026-08", "2029-09", 37],
    ["2026-12", "2027-01", 1],
    ["2027-01", "2026-12", 1],
    ["2028-03", "2028-02", 1],
    ["2027-01", "2027-01", 0],
  ])("navega de %s para %s em %i passos", async (origem, destino, passos) => {
    let atual = origem;
    let cliques = 0;
    await navegarMeses(
      async () => atual,
      async (direcao) => {
        atual = mesSeguinte(atual, direcao);
        cliques++;
      },
      destino,
    );
    expect(atual).toBe(destino);
    expect(cliques).toBe(passos);
  });

  it.each(["2025-12", "2027-01", "2027-12"])(
    "chega ao ano de 2026 da grade iniciada em %s",
    async (origem) => {
      let ano = `${origem.slice(0, 4)}-01`;
      await navegarMeses(
        async () => ano,
        async (direcao) => {
          ano = mesSeguinte(ano, 12 * direcao);
        },
        "2026-01",
        12,
      );
      expect(ano).toBe("2026-01");
    },
  );

  it("interrompe uma UI que não muda de mês", async () => {
    let cliques = 0;
    await expect(
      navegarMeses(
        async () => "2029-09",
        async () => {
          cliques++;
        },
        "2026-08",
      ),
    ).rejects.toThrow("não avançou");
    expect(cliques).toBe(1);
  });

  it("recusa período inalcançável por passos anuais", async () => {
    await expect(
      navegarMeses(
        async () => "2026-01",
        async () => {},
        "2026-02",
        12,
      ),
    ).rejects.toThrow("não é alcançável");
  });

  it.each(["2026-00", "2026-13", "2026-2", "0000-01", "2026-01-01"])(
    "rejeita mês malformado %s em qualquer extremidade",
    (mes) => {
      expect(() => deslocamentoMes(mes, "2026-01")).toThrow("Mês inválido");
      expect(() => deslocamentoMes("2026-01", mes)).toThrow("Mês inválido");
    },
  );
  it.each(["2028-02-30", "2028-2-01", "2028-04-31"])("rejeita dia inválido %s", (dia) => {
    expect(() => validarDiaCivil(dia)).toThrow();
  });
});
