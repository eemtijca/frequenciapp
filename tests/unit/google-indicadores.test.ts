// Contratos HTTP da fonte dedicada: propriedade, envio atômico e interrupção da trava.
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarPlanilhaIndicadores, substituirIndicadores } from "@/infra/google-indicadores";
import { montarIndicadores } from "@/domain/indicadores";

const controle = () => ({ signal: new AbortController().signal, conferir: vi.fn() });
const doc = (geracao = "geracao") => ({
  spreadsheetId: "QA_indicadores",
  developerMetadata: [
    {
      metadataKey: "frequenciapp.indicadores",
      metadataValue: geracao,
      location: { spreadsheet: true },
    },
  ],
  sheets: ["Frequencia", "Movimentacoes", "Parciais", "Aulas_parciais"].map((title, sheetId) => ({
    properties: { title, sheetId },
  })),
});
afterEach(() => vi.unstubAllGlobals());

describe("Arquivo exclusivo de indicadores", () => {
  it("cria quatro abas marcadas sem modificar permissões ou arquivos operacionais", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(doc()));
    vi.stubGlobal("fetch", fetch);
    expect(await criarPlanilhaIndicadores("geracao", "token", controle())).toBe("QA_indicadores");
    const [url, opcoes] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    const corpo = String((opcoes as RequestInit).body);
    expect(corpo).toContain("frequenciapp.indicadores");
    expect(corpo).not.toMatch(/permissions|anyone|publish/);
  });
  it("verifica o arquivo e substitui as quatro abas com um único batchUpdate", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(doc()))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await substituirIndicadores(
      "QA_indicadores",
      "geracao",
      "token",
      montarIndicadores([], [], []),
      controle(),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/QA_indicadores:batchUpdate",
    );
  });
  it.each(["outra-instalacao", ""])(
    "bloqueia outro arquivo antes da escrita (%s)",
    async (geracao) => {
      const fetch = vi.fn().mockResolvedValue(Response.json(doc(geracao)));
      vi.stubGlobal("fetch", fetch);
      await expect(
        substituirIndicadores(
          "QA_indicadores",
          "geracao",
          "token",
          montarIndicadores([], [], []),
          controle(),
        ),
      ).rejects.toThrow("não é a fonte");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("interrompe antes do HTTP se a trava for perdida", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const trava = controle();
    trava.conferir.mockImplementation(() => {
      throw new Error("Trava perdida");
    });
    await expect(criarPlanilhaIndicadores("geracao", "token", trava)).rejects.toThrow(
      "Trava perdida",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("não repete a criação diante de resposta perdida", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Resposta perdida"));
    vi.stubGlobal("fetch", fetch);
    await expect(criarPlanilhaIndicadores("geracao", "token", controle())).rejects.toThrow(
      "não confirmou",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
