import { describe, expect, it, vi } from "vitest";
import { cabecalhoDaFixture } from "../helpers/cabecalho-planilha-fixture";
import { criarGoogleFalso } from "../helpers/google-falso";
import { Server } from "node:net";
import type pg from "pg";

vi.mock("../../src/infra/google/oauth", () => ({ cifrarToken: () => "não usado" }));

describe("cabeçalho observado da planilha sintética", () => {
  it("lê a coluna após uma lacuna do Google falso real sem abrir rede", async () => {
    const escutar = vi.spyOn(Server.prototype, "listen").mockImplementation(() => {
      throw new Error("Rede proibida neste teste.");
    });
    try {
      const google = await criarGoogleFalso({ semServidor: true });
      try {
        google.definirAba("Turma", [["Aluno", "01/06"]]);
        google.definirValor("Turma", 1, 4, "04/06");
        google.definirValor("Turma", 1, 5, "");
        expect(cabecalhoDaFixture(google, "Turma")).toEqual(["Aluno", "01/06", "", "04/06"]);
        const query = vi.fn();
        await expect(google.conectar({ query } as unknown as pg.Client)).rejects.toThrow(
          /sem servidor/,
        );
        expect(query).not.toHaveBeenCalled();
        expect(escutar).not.toHaveBeenCalled();
      } finally {
        await google.fechar();
      }
    } finally {
      escutar.mockRestore();
    }
  });
  it("inclui feriado espúrio mesmo depois das colunas esperadas e de uma coluna vazia", () => {
    const linha = ["Aluno", "01/06", "02/06", "", "04/06"];
    const google = {
      valor: (_aba: string, _linha: number, coluna: number) => linha[coluna - 1] ?? "",
      linha: () => [...linha],
    };
    const observado = cabecalhoDaFixture(google, "Turma");
    expect(observado).toEqual(["Aluno", "01/06", "02/06", "", "04/06"]);
    expect(observado).toContain("04/06");
  });

  it("descarta apenas células vazias finais e preserva as intermediárias", () => {
    const valores = ["Aluno", "", "04/06", "", ""];
    expect(cabecalhoDaFixture({ linha: () => [...valores] }, "Turma")).toEqual([
      "Aluno",
      "",
      "04/06",
    ]);
    expect(valores).toHaveLength(5);
  });
});
