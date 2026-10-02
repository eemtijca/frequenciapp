// Recusa da versão legada antes de qualquer escrita, preservando a conexão Google.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dubl = vi.hoisted(() => ({ gas: vi.fn(), acesso: vi.fn(), google: vi.fn() }));
vi.mock("@/infra/banco", () => ({ banco: vi.fn() }));
vi.mock("@/infra/ambiente", () => ({ ambiente: {} }));
vi.mock("@/infra/planilha", () => ({ chamarGas: dubl.gas }));
vi.mock("@/infra/google-oauth", () => ({ renovarAcesso: dubl.acesso }));
vi.mock("@/infra/google-planilhas-api", () => ({ executarAcaoGoogle: dubl.google }));

import {
  chamarIntegracao,
  ErroVersaoPlanilha,
  type LinhaIntegracao,
} from "@/application/planilha-comum";

function linha(provedor = "GAS", versaoScript: string | null = "7"): LinhaIntegracao {
  return {
    ativa: true,
    provedor,
    endpoint: "https://script.google.com/macros/s/sintetico/exec",
    token: "token-sintetico",
    versaoScript,
    googleRefreshToken: "credencial-sintetica",
    googlePlanilhaId: "arquivo-sintetico",
    googlePlanilhaNome: "QA",
    esquema: null,
    assinaturaEsquema: null,
    esquemaEm: null,
    modo: "CONSERVADOR",
    modoCompletoAte: null,
    envioAutomatico: true,
    atualizadoEm: new Date("2026-06-01T12:00:00Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dubl.gas.mockResolvedValue({ preenchidas: 1 });
  dubl.google.mockResolvedValue({ preenchidas: 1 });
  dubl.acesso.mockResolvedValue("acesso-sintetico");
});

describe("versão antes do envio à planilha", () => {
  it.each([null, "6"])("a versão %s é recusada sem tentar qualquer escrita", async (versao) => {
    await expect(
      chamarIntegracao(linha("GAS", versao), { acao: "aplicar" }),
    ).rejects.toBeInstanceOf(ErroVersaoPlanilha);
    expect(dubl.gas).not.toHaveBeenCalled();
    expect(dubl.google).not.toHaveBeenCalled();
    expect(dubl.acesso).not.toHaveBeenCalled();
  });

  it("o Google envia sem depender da versão de um Apps Script", async () => {
    await expect(
      chamarIntegracao(linha("GOOGLE", null), { acao: "aplicar" }, { retentavel: false }),
    ).resolves.toEqual({ preenchidas: 1 });
    expect(dubl.google).toHaveBeenCalledWith("arquivo-sintetico", "acesso-sintetico", {
      acao: "aplicar",
    });
    expect(dubl.gas).not.toHaveBeenCalled();
  });

  it("a versão atual encaminha a escrita uma vez com a opção de não repetir", async () => {
    await chamarIntegracao(linha(), { acao: "aplicar" }, { retentavel: false });
    expect(dubl.gas).toHaveBeenCalledOnce();
    expect(dubl.gas).toHaveBeenCalledWith(
      linha().endpoint,
      "token-sintetico",
      { acao: "aplicar" },
      { retentavel: false },
    );
  });
});
