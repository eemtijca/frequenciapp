// Protege o texto manual e a revisão do índice, inclusive após respostas perdidas.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashTexto } from "@/domain/planilha";
import { atualizarDocumentoIndice, criarDocumentoIndice } from "@/infra/google/documentos-indice";

const indice = { texto: "Índice QA", estilos: [] };
const documento = (texto: string) =>
  Response.json({
    documentId: "qa-documento",
    revisionId: "revisao-qa",
    body: {
      content: [
        { endIndex: texto.length + 1, paragraph: { elements: [{ textRun: { content: texto } }] } },
      ],
    },
  });

afterEach(() => vi.unstubAllGlobals());

describe("documento do índice", () => {
  it("preserva texto manual antes de enviar qualquer escrita", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(documento("QA Anotação manual\n"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      atualizarDocumentoIndice("token-qa", "qa-documento", indice, null),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("condiciona a substituição à revisão e preserva a última quebra de parágrafo", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(documento("QA Texto anterior\n"))
      .mockResolvedValueOnce(Response.json({ replies: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await atualizarDocumentoIndice(
        "token-qa",
        "qa-documento",
        indice,
        hashTexto("QA Texto anterior\n"),
      ),
    ).toBe(hashTexto("Índice QA\n"));
    const pedido = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as {
      writeControl: unknown;
      requests: unknown[];
    };
    expect(pedido.writeControl).toEqual({ requiredRevisionId: "revisao-qa" });
    expect(pedido.requests[0]).toEqual({
      deleteContentRange: { range: { startIndex: 1, endIndex: "QA Texto anterior\n".length } },
    });
  });

  it("recupera texto desejado após resposta perdida sem reenviar", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(documento("Índice QA\n"));
    vi.stubGlobal("fetch", fetch);
    expect(await atualizarDocumentoIndice("token-qa", "qa-documento", indice, null)).toBe(
      hashTexto("Índice QA\n"),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("não repete atualização recusada por revisão concorrente", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(documento("\n"))
      .mockResolvedValueOnce(Response.json({}, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      atualizarDocumentoIndice("token-qa", "qa-documento", indice, null),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("não repete criação após perda de resposta", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError("QA Resposta perdida"));
    vi.stubGlobal("fetch", fetch);
    await expect(criarDocumentoIndice("token-qa", "QA Índice")).rejects.toMatchObject({
      recusado: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([403, 503])("distingue recusa explícita de resultado incerto em %i", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({}, { status })),
    );
    await expect(criarDocumentoIndice("token-qa", "QA Índice")).rejects.toMatchObject({
      recusado: status < 500,
    });
  });
});
