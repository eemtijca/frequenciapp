import { describe, expect, it, vi } from "vitest";
import { mesSeguinte, nomeDoMes } from "@/domain/frequencia";
import type { Locator, Page } from "@playwright/test";

vi.mock("@playwright/test", () => ({
  expect: (alvo: {
    getAttribute: (nome: string) => Promise<string>;
    isVisible: () => Promise<boolean>;
    count: () => Promise<number>;
  }) => ({
    not: {
      toHaveAttribute: async (nome: string, valor: string) =>
        expect(await alvo.getAttribute(nome)).not.toBe(valor),
    },
    toBeVisible: async () => expect(await alvo.isVisible()).toBe(true),
    toHaveCount: async (valor: number) => expect(await alvo.count()).toBe(valor),
  }),
}));

import { escolherDataNoPeriodo } from "../ponta-a-ponta/helpers/pagina";
import { escolherMesNoPeriodo } from "../ponta-a-ponta/helpers/calendario";

function simulador(inicial: string, modo: "dia" | "mes", limite?: string) {
  let atual = inicial;
  let aberto = false;
  let selecionado = "";
  const passos: string[] = [];
  const gatilho = {
    getAttribute: async () => "Data: nenhuma",
    click: async () => {
      aberto = true;
    },
  };
  const painel = {
    count: async () => Number(aberto),
    getByRole: (papel: string, opcoes: { name: string | RegExp }) => {
      if (papel === "group") {
        const rotulo = () =>
          modo === "dia"
            ? `Dias de ${nomeDoMes(atual)} de ${atual.slice(0, 4)}`
            : `Meses de ${atual.slice(0, 4)}`;
        return {
          getAttribute: async () => rotulo(),
          isVisible: async () =>
            typeof opcoes.name === "string" ? opcoes.name === rotulo() : opcoes.name.test(rotulo()),
          getByRole: (_: string, dia: { name: string | RegExp }) => ({
            isVisible: async () => true,
            isEnabled: async () => true,
            click: async () => {
              selecionado = String(dia.name);
              aberto = false;
            },
          }),
        };
      }
      const nome = String(opcoes.name);
      return {
        isEnabled: async () => atual !== limite,
        click: async () => {
          passos.push(nome);
          const direcao = nome.includes("anterior") ? -1 : 1;
          atual = mesSeguinte(atual, direcao * (modo === "dia" ? 1 : 12));
        },
      };
    },
  };
  const page = { getByRole: (papel: string) => (papel === "dialog" ? painel : gatilho) };
  return {
    page: page as unknown as Page,
    escopo: page as unknown as Locator,
    resultado: () => ({ atual, selecionado, passos, aberto }),
  };
}

describe("helpers de calendário sem navegador", () => {
  it.each([
    ["1000-02", "1000-01-15"],
    ["9999-10", "9999-11-15"],
  ])("seleciona limites de navegação %s para %s", async (origem, destino) => {
    const ui = simulador(origem, "dia");
    await escolherDataNoPeriodo(ui.page, "Data", destino);
    expect(ui.resultado().atual).toBe(destino.slice(0, 7));
    expect(ui.resultado().passos).toHaveLength(1);
    expect(ui.resultado().aberto).toBe(false);
  });
  it.each(["0099", "0999", "9999"])(
    "recusa o destino fora da faixa antes de abrir os seletores (%s)",
    async (ano) => {
      const mes = ano === "9999" ? `${ano}-12` : `${ano}-01`;
      const dia = simulador("2026-01", "dia");
      await expect(escolherDataNoPeriodo(dia.page, "Data", `${mes}-01`)).rejects.toThrow(
        /1000-01.*9999-11/,
      );
      expect(dia.resultado().aberto).toBe(false);
      const mensal = simulador("2026-01", "mes");
      await expect(escolherMesNoPeriodo(mensal.page, mensal.escopo, "Mês", mes)).rejects.toThrow(
        /1000-01.*9999-11/,
      );
      expect(mensal.resultado().aberto).toBe(false);
    },
  );
  it.each(["0099-01", "0999-01"])(
    "recusa a origem histórica %s antes de clicar nas setas dos dois seletores",
    async (origem) => {
      const dia = simulador(origem, "dia");
      await expect(escolherDataNoPeriodo(dia.page, "Data", "2026-01-01")).rejects.toThrow(
        /1000-01.*9999-11/,
      );
      expect(dia.resultado().passos).toHaveLength(0);
      const mensal = simulador(origem, "mes");
      await expect(
        escolherMesNoPeriodo(mensal.page, mensal.escopo, "Mês", "2026-01"),
      ).rejects.toThrow(/1000-01.*9999-11/);
      expect(mensal.resultado().passos).toHaveLength(0);
    },
  );
  it.each([
    ["2029-09", "2026-08-15", "Mês anterior"],
    ["2026-08", "2029-09-15", "Mês seguinte"],
  ])("seleciona %s para %s na grade correta", async (origem, destino, direcao) => {
    const ui = simulador(origem, "dia");
    await escolherDataNoPeriodo(ui.page, "Data", destino);
    const resultado = ui.resultado();
    expect(resultado.atual).toBe(destino.slice(0, 7));
    expect(resultado.passos).toHaveLength(37);
    expect(resultado.passos.every((passo) => passo === direcao)).toBe(true);
    expect(resultado.selecionado).toContain(nomeDoMes(destino).toLowerCase());
    expect(resultado.aberto).toBe(false);
  });
  it("não seleciona além de um limite desabilitado", async () => {
    const ui = simulador("2026-02", "dia", "2026-02");
    await expect(escolherDataNoPeriodo(ui.page, "Data", "2026-01-01")).rejects.toThrow(
      "desabilitado",
    );
    expect(ui.resultado().selecionado).toBe("");
  });
  it.each([
    ["2029-08", "2026-09", "Ano anterior"],
    ["2026-08", "2029-09", "Ano seguinte"],
  ])("seleciona mês no ano certo de %s até %s", async (origem, destino, direcao) => {
    const ui = simulador(origem, "mes");
    await escolherMesNoPeriodo(ui.page, ui.escopo, "Mês", destino);
    const resultado = ui.resultado();
    expect(resultado.atual.slice(0, 4)).toBe(destino.slice(0, 4));
    expect(resultado.passos).toEqual([direcao, direcao, direcao]);
    expect(resultado.selecionado).toBe(nomeDoMes(destino));
    expect(resultado.aberto).toBe(false);
  });
});
