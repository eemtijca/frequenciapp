// Ações da planilha com o acesso Google guardado: descarte em qualquer falha e uma
// única repetição, só em leitura, quando o Google recusa o acesso guardado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroHttp } from "@/infra/erros";
import type { LinhaIntegracao } from "@/application/planilha-comum";

const dubl = vi.hoisted(() => ({
  acesso: vi.fn(),
  esquecer: vi.fn(),
  executar: vi.fn(),
}));
vi.mock("@/infra/banco", () => ({ banco: () => ({}) }));
vi.mock("@/infra/google-oauth", () => ({
  acessoGoogle: dubl.acesso,
  esquecerAcessoGoogle: dubl.esquecer,
}));
vi.mock("@/infra/google-planilhas-api", () => ({ executarAcaoGoogle: dubl.executar }));

import { chamarIntegracao } from "@/application/planilha-comum";

const linha: LinhaIntegracao = {
  ativa: true,
  googleRefreshToken: "token-cifrado-sintetico",
  googlePlanilhaId: "planilha-sintetica",
  googlePlanilhaNome: "Planilha sintética",
  esquema: null,
  assinaturaEsquema: null,
  esquemaEm: null,
  modo: "CONSERVADOR",
  modoCompletoAte: null,
  envioAutomatico: true,
  atualizadoEm: new Date("2026-06-15T12:00:00Z"),
};
const recusado = () => new ErroHttp("Reconecte a conta Google.", 409, "GOOGLE_RECONECTAR");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("acesso guardado nas ações da planilha", () => {
  it("usa o acesso guardado sem renovar nem descartar", async () => {
    dubl.acesso.mockResolvedValue({ acesso: "guardado", guardado: true });
    dubl.executar.mockResolvedValue({ abas: [] });
    expect(await chamarIntegracao(linha, { acao: "ler", aba: "QA" })).toEqual({ abas: [] });
    expect(dubl.acesso).toHaveBeenCalledExactlyOnceWith("token-cifrado-sintetico");
    expect(dubl.executar).toHaveBeenCalledExactlyOnceWith("planilha-sintetica", "guardado", {
      acao: "ler",
      aba: "QA",
    });
    expect(dubl.esquecer).not.toHaveBeenCalled();
  });

  it("renova e repete uma vez a leitura recusada com o acesso guardado", async () => {
    dubl.acesso
      .mockResolvedValueOnce({ acesso: "guardado", guardado: true })
      .mockResolvedValueOnce({ acesso: "novo", guardado: false });
    dubl.executar.mockRejectedValueOnce(recusado()).mockResolvedValueOnce({ lido: true });
    expect(await chamarIntegracao(linha, { acao: "catalogoFrequencia" })).toEqual({ lido: true });
    expect(dubl.esquecer).toHaveBeenCalledExactlyOnceWith("token-cifrado-sintetico");
    expect(dubl.executar.mock.calls.map((chamada) => chamada[1])).toEqual(["guardado", "novo"]);
  });

  it.each(["lerVarias", "abasMensais", "listarCopias", "listarAbasBackup", "preverAbaAntiga"])(
    "repete a leitura %s recusada com o acesso guardado",
    async (acao) => {
      dubl.acesso
        .mockResolvedValueOnce({ acesso: "guardado", guardado: true })
        .mockResolvedValueOnce({ acesso: "novo", guardado: false });
      dubl.executar.mockRejectedValueOnce(recusado()).mockResolvedValueOnce({ lido: true });
      expect(await chamarIntegracao(linha, { acao })).toEqual({ lido: true });
      expect(dubl.executar).toHaveBeenCalledTimes(2);
    },
  );

  it("descarta também o acesso renovado quando a repetição falha", async () => {
    const segunda = recusado();
    dubl.acesso
      .mockResolvedValueOnce({ acesso: "guardado", guardado: true })
      .mockResolvedValueOnce({ acesso: "novo", guardado: false });
    dubl.executar.mockRejectedValueOnce(recusado()).mockRejectedValueOnce(segunda);
    await expect(chamarIntegracao(linha, { acao: "ler" })).rejects.toBe(segunda);
    expect(dubl.esquecer).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["uma escrita", { acao: "aplicar" }, true, recusado()],
    ["um acesso recém-renovado", { acao: "ler" }, false, recusado()],
    ["outra falha", { acao: "ler" }, true, new ErroHttp("A aba foi substituída.", 409)],
  ])("descarta o acesso sem repetir %s", async (_caso, corpo, guardado, erro) => {
    dubl.acesso.mockResolvedValue({ acesso: "acesso", guardado });
    dubl.executar.mockRejectedValue(erro);
    await expect(chamarIntegracao(linha, corpo)).rejects.toBe(erro);
    expect(dubl.executar).toHaveBeenCalledOnce();
    expect(dubl.esquecer).toHaveBeenCalledExactlyOnceWith("token-cifrado-sintetico");
  });

  it("devolve a recusa da renovação quando a autorização foi revogada", async () => {
    const revogada = new ErroHttp(
      "A autorização Google expirou ou foi revogada. Conecte a conta novamente.",
      409,
      "GOOGLE_RECONECTAR",
    );
    dubl.acesso
      .mockResolvedValueOnce({ acesso: "guardado", guardado: true })
      .mockRejectedValueOnce(revogada);
    dubl.executar.mockRejectedValue(recusado());
    await expect(chamarIntegracao(linha, { acao: "estrutura" })).rejects.toBe(revogada);
    expect(dubl.executar).toHaveBeenCalledOnce();
  });

  it("não consulta o Google sem conexão", async () => {
    await expect(
      chamarIntegracao({ ...linha, googleRefreshToken: null }, { acao: "ler" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(dubl.acesso).not.toHaveBeenCalled();
  });
});
