// Limites temporários em leituras reais do adaptador, com tempo e Google simulados.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  estruturaGoogle,
  lerDocumentoGoogle,
  tamanhoUtilizado,
} from "@/infra/google-planilhas-api";
import { comPausasDeLeituraGoogle } from "@/infra/google-planilhas-limites";
import { enviarLotesGoogle } from "@/infra/google-planilhas-escrita";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function limite(headers?: HeadersInit) {
  return Response.json(
    { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } },
    { status: 429, headers },
  );
}

describe("pausas de leitura na organização", () => {
  it("conclui nove abas quando o Google limita leituras após as três primeiras", async () => {
    const inicio = Date.now();
    let janela = 0;
    let usadas = 0;
    let recusas = 0;
    const nomes = Array.from({ length: 9 }, (_, indice) => `QA Turma ${indice + 1}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) => {
        const atual = Math.floor((Date.now() - inicio) / 60_000);
        if (atual !== janela) {
          janela = atual;
          usadas = 0;
        }
        if (usadas >= 12) {
          recusas += 1;
          return limite();
        }
        usadas += 1;
        const url = new URL(String(entrada));
        if (url.pathname.endsWith("/developerMetadata:search"))
          return Response.json({ matchedDeveloperMetadata: [] });
        if (url.pathname.includes("/values/"))
          return Response.json({
            values: [
              ["Aluno", "29/09/2026"],
              ["QA Aluno", "F"],
            ],
          });
        if (url.searchParams.get("includeGridData") === "true")
          return Response.json({ sheets: [{ data: [{ rowData: [] }] }] });
        return Response.json({
          spreadsheetId: "arquivo-sintetico",
          properties: { title: "QA Escola" },
          sheets: nomes.map((title, sheetId) => ({ properties: { title, sheetId } })),
        });
      }),
    );
    const concluidas: string[] = [];
    const lote = (async () => {
      for (const nome of nomes) {
        const resposta = await comPausasDeLeituraGoogle(() =>
          estruturaGoogle("arquivo-sintetico", "acesso-falso", nome, true),
        );
        concluidas.push(resposta.abas[0]?.nome ?? "");
      }
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(concluidas).toEqual(nomes.slice(0, 3));
    await vi.runAllTimersAsync();
    await lote;
    expect(concluidas).toEqual(nomes);
    expect(recusas).toBe(4);
    expect(Date.now() - inicio).toBe(120_000);
  });

  it.each([
    ["2", 2_000],
    ["data", 3_000],
    ["inválido", 60_000],
  ])("respeita Retry-After %s sem retornar antes do prazo", async (cabecalho, espera) => {
    const indicado = cabecalho === "data" ? new Date(Date.now() + espera).toUTCString() : cabecalho;
    const chamada = vi.fn().mockResolvedValueOnce(limite({ "Retry-After": indicado }));
    chamada.mockResolvedValueOnce(Response.json({ values: [["Aluno"]] }));
    vi.stubGlobal("fetch", chamada);
    const leitura = comPausasDeLeituraGoogle(() => tamanhoUtilizado("arquivo", "acesso", "QA"));
    await vi.advanceTimersByTimeAsync(espera - 1);
    expect(chamada).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(leitura).resolves.toEqual({ linhas: 1, colunas: 1 });
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("encerra uma recusa persistente após duas pausas", async () => {
    const chamada = vi.fn(async () => limite());
    vi.stubGlobal("fetch", chamada);
    const leitura = comPausasDeLeituraGoogle(() => tamanhoUtilizado("arquivo", "acesso", "QA"));
    const resultado = expect(leitura).rejects.toMatchObject({ status: 429 });
    await vi.runAllTimersAsync();
    await resultado;
    expect(chamada).toHaveBeenCalledTimes(3);
  });

  it("não antecipa uma espera pedida pelo Google acima do orçamento", async () => {
    const chamada = vi.fn(async () => limite({ "Retry-After": "120" }));
    vi.stubGlobal("fetch", chamada);
    await expect(
      comPausasDeLeituraGoogle(() => tamanhoUtilizado("arquivo", "acesso", "QA")),
    ).rejects.toMatchObject({ status: 429 });
    expect(chamada).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mantém a política das outras operações durante a pausa de uma organização", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => limite()),
    );
    const organizacao = comPausasDeLeituraGoogle(() => tamanhoUtilizado("arquivo", "acesso", "QA"));
    const resultado = expect(organizacao).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(tamanhoUtilizado("arquivo", "acesso", "QA")).rejects.toMatchObject({
      status: 429,
    });
    await vi.runAllTimersAsync();
    await resultado;
  });

  it("compartilha a pausa entre estrutura e busca de metadados", async () => {
    const inicio = Date.now();
    const chamada = vi.fn(async (entrada: URL | string) => {
      if (Date.now() === inicio) return limite();
      return String(entrada).includes("developerMetadata:search")
        ? Response.json({ matchedDeveloperMetadata: [] })
        : Response.json({ spreadsheetId: "arquivo", properties: { title: "QA" }, sheets: [] });
    });
    vi.stubGlobal("fetch", chamada);
    const leitura = comPausasDeLeituraGoogle(() => lerDocumentoGoogle("arquivo", "acesso"));
    await vi.runAllTimersAsync();
    await expect(leitura).resolves.toMatchObject({ spreadsheetId: "arquivo" });
    expect(Date.now() - inicio).toBe(60_000);
    expect(chamada).toHaveBeenCalledTimes(4);
  });

  it.each([401, 403, 404, 500])("não repete uma leitura recusada com HTTP %s", async (status) => {
    const chamada = vi.fn(async () => Response.json({ error: {} }, { status }));
    vi.stubGlobal("fetch", chamada);
    await expect(
      comPausasDeLeituraGoogle(() => tamanhoUtilizado("arquivo", "acesso", "QA")),
    ).rejects.toThrow();
    expect(chamada).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("não repete escritas mesmo dentro da organização", async () => {
    const chamada = vi.fn(async () => limite());
    vi.stubGlobal("fetch", chamada);
    await expect(
      comPausasDeLeituraGoogle(() => enviarLotesGoogle("arquivo", "acesso", [{ updateCells: {} }])),
    ).rejects.toThrow();
    expect(chamada).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
