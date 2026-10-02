// Prévia de limpeza ligada à conexão, com senha administrativa e ausência de reenvio.
import { beforeEach, describe, expect, it, vi } from "vitest";
const dubl = vi.hoisted(() => ({
  linha: vi.fn(),
  chamar: vi.fn(),
  senha: vi.fn(),
  auditar: vi.fn(),
}));
vi.mock("@/application/planilha-comum", () => ({
  lerLinha: dubl.linha,
  chamarIntegracao: dubl.chamar,
}));
vi.mock("@/application/confirmacao-admin", () => ({ conferirSenhaDoAdmin: dubl.senha }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { authSecret: "segredo-sintetico-da-limpeza" } }));
vi.mock("@/infra/banco", () => ({ banco: () => ({}) }));
vi.mock("@/infra/auditoria", () => ({ auditar: dubl.auditar }));
import { limparCopiasDaPlanilha } from "@/application/planilha-limpeza";
const nomes = ["_frequenciapp_backup_QA_20260930-130258-674"];
beforeEach(() => {
  vi.clearAllMocks();
  dubl.linha.mockResolvedValue({
    googlePlanilhaId: "arquivo",
    googleRefreshToken: "credencial-sintetica",
  });
  dubl.chamar.mockImplementation(async (_linha, corpo) =>
    corpo.acao === "listarAbasBackup" ? { copias: nomes } : { removidas: 1 },
  );
});
async function previa() {
  const resultado = await limparCopiasDaPlanilha({ id: "admin" }, "FREQUENCIA", {});
  return resultado.previa?.planoHash;
}
describe("limpeza administrativa das cópias", () => {
  it("a prévia não remove nada e a aplicação exige senha e frase", async () => {
    const planoHash = await previa();
    expect(dubl.chamar).toHaveBeenCalledTimes(1);
    expect(dubl.senha).not.toHaveBeenCalled();
    await expect(
      limparCopiasDaPlanilha({ id: "admin" }, "FREQUENCIA", { planoHash }),
    ).rejects.toThrow("senha e a frase");
    await limparCopiasDaPlanilha({ id: "admin" }, "FREQUENCIA", {
      planoHash,
      senha: "senha-sintetica",
      frase: "EDITAR PLANILHA",
    });
    expect(dubl.chamar).toHaveBeenLastCalledWith(expect.anything(), {
      acao: "removerAbasBackup",
      copias: nomes,
    });
    expect(dubl.senha).toHaveBeenCalledOnce();
    expect(dubl.auditar).toHaveBeenCalledOnce();
  });
  it.each(["arquivo", "credencial", "lista"])(
    "bloqueia mudança de %s depois da prévia",
    async (tipo) => {
      const planoHash = await previa();
      if (tipo === "lista") dubl.chamar.mockResolvedValue({ copias: [...nomes, "outra"] });
      else
        dubl.linha.mockResolvedValue({
          googlePlanilhaId: tipo === "arquivo" ? "outro" : "arquivo",
          googleRefreshToken: tipo === "credencial" ? "outra" : "credencial-sintetica",
        });
      await expect(
        limparCopiasDaPlanilha({ id: "admin" }, "FREQUENCIA", {
          planoHash,
          senha: "senha-sintetica",
          frase: "EDITAR PLANILHA",
        }),
      ).rejects.toThrow("nova prévia");
      expect(dubl.chamar.mock.calls.every(([, corpo]) => corpo.acao === "listarAbasBackup")).toBe(
        true,
      );
      expect(dubl.auditar).not.toHaveBeenCalled();
    },
  );
  it("recusa uma senha incorreta antes de consultar ou apagar a planilha", async () => {
    const planoHash = await previa();
    dubl.chamar.mockClear();
    dubl.senha.mockRejectedValueOnce(new Error("Senha incorreta."));
    await expect(
      limparCopiasDaPlanilha({ id: "admin" }, "FREQUENCIA", {
        planoHash,
        senha: "senha-errada",
        frase: "EDITAR PLANILHA",
      }),
    ).rejects.toThrow("Senha incorreta");
    expect(dubl.chamar).not.toHaveBeenCalled();
  });
});
