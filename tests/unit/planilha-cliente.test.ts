// Cliente do Apps Script: recusa, falha parcial e detalhe técnico fora da
// frase exibida, com fetch simulado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarGas, ErroGas, mensagemParaRegistro } from "@/infra/planilha";
import { ErroHttp } from "@/infra/erros";

function responderCom(envelope: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 })),
  );
}

async function capturar(): Promise<ErroGas> {
  try {
    await chamarGas("https://script.google.com/exec", "token", { acao: "aplicar" });
  } catch (erro) {
    if (erro instanceof ErroGas) return erro;
    throw erro;
  }
  throw new Error("A chamada deveria falhar.");
}

describe("cliente do Apps Script", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("trata recusa prevista como recusada, sem detalhe", async () => {
    responderCom({ ok: false, erro: "O modo completo não está ativo." });
    const erro = await capturar();
    expect(erro.message).toBe("O modo completo não está ativo.");
    expect(erro.recusado).toBe(true);
    expect(erro.detalhe).toBeNull();
  });

  it("trata exceção no meio do plano como parcial e guarda o detalhe", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    responderCom({
      ok: false,
      erro: "Não foi possível concluir a operação na planilha.",
      detalhe: "Exception: Service Spreadsheets failed.",
      parcial: true,
    });
    const erro = await capturar();
    expect(erro.message).toBe("Não foi possível concluir a operação na planilha.");
    expect(erro.recusado).toBe(false);
    expect(erro.detalhe).toBe("Exception: Service Spreadsheets failed.");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Service Spreadsheets failed"));
  });

  it("monta o texto do registro com frase e detalhe no limite da coluna", () => {
    const erro = new ErroGas(
      "Não foi possível concluir a operação na planilha.",
      false,
      "x".repeat(400),
    );
    const texto = mensagemParaRegistro(erro, "padrão");
    expect(texto.startsWith("Não foi possível concluir a operação na planilha. Detalhe: x")).toBe(
      true,
    );
    expect(texto).toHaveLength(300);
    expect(mensagemParaRegistro(new ErroHttp("Frase.", 400), "padrão")).toBe("Frase.");
    expect(mensagemParaRegistro(new Error("interno"), "padrão")).toBe("padrão");
  });
});
