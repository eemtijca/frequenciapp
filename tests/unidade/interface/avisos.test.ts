// Avisos de erro: a dica de internet só aparece em falha de rede ou servidor,
// nunca em regra de negócio 4xx.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { publicar } = vi.hoisted(() => ({ publicar: vi.fn() }));
vi.mock("@/components/ui/mui/avisos", () => ({
  publicarAviso: publicar,
}));

import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { ErroApi } from "@/lib/api-cliente";

describe("avisarErro", () => {
  beforeEach(() => {
    publicar.mockClear();
  });

  it("não sugere conferir a internet em conflito de catálogo", () => {
    avisarErro(
      new ErroApi(
        "Esta justificativa está em uso em 2 registros.",
        409,
        false,
        undefined,
        "JUSTIFICATIVA_EM_USO",
      ),
      { contexto: "Não foi possível excluir a justificativa." },
    );
    expect(publicar).toHaveBeenCalledTimes(1);
    const [aviso] = publicar.mock.calls[0] ?? [];
    expect(aviso).toMatchObject({
      severidade: "error",
      titulo: "Esta justificativa está em uso em 2 registros.",
    });
    expect(aviso.descricao).toBeUndefined();
    expect(JSON.stringify(aviso)).not.toContain("internet");
    expect(JSON.stringify(aviso)).not.toContain("chamada");
  });

  it("sugere tentar de novo em falha de servidor", () => {
    avisarErro(new ErroApi("Serviço indisponível.", 503), {
      contexto: "Não foi possível carregar.",
    });
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({
        severidade: "error",
        titulo: "Serviço indisponível.",
        descricao: "Tente de novo em instantes.",
      }),
    );
  });

  it("sugere conferir a internet em falha desconhecida", () => {
    avisarErro(new TypeError("Failed to fetch"), {
      contexto: "Não foi possível carregar os dados.",
    });
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({
        severidade: "error",
        titulo: "Não foi possível carregar os dados.",
        descricao: "Confira a internet e tente de novo em instantes.",
      }),
    );
  });

  it("mantém a descrição informada e a ação de repetir", () => {
    const repetir = vi.fn();
    avisarErro(new ErroApi("Falha passageira.", 500), {
      contexto: "Não foi possível salvar.",
      descricao: "A chamada continua na tela.",
      tentarDeNovo: repetir,
      id: "salvar",
    });
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({
        severidade: "error",
        titulo: "Falha passageira.",
        descricao: "A chamada continua na tela.",
        tentarDeNovo: repetir,
        id: "salvar",
      }),
    );
  });

  it("ignora a sessão expirada, que tem fluxo próprio", () => {
    avisarErro(new ErroApi("Sua sessão expirou.", 401), {
      contexto: "Não foi possível carregar.",
    });
    expect(publicar).not.toHaveBeenCalled();
  });
});

describe("avisos de sucesso e informação", () => {
  beforeEach(() => {
    publicar.mockClear();
  });

  it("publica o tom de sucesso com a descrição e o id", () => {
    avisarSucesso("Salvo.", "A chamada foi atualizada.", "chamada");
    expect(publicar).toHaveBeenCalledWith({
      severidade: "success",
      titulo: "Salvo.",
      descricao: "A chamada foi atualizada.",
      id: "chamada",
    });
  });

  it("publica o tom de informação com a descrição e o id", () => {
    avisarInfo("Atenção.", "Salve antes de atualizar.", "dados");
    expect(publicar).toHaveBeenCalledWith({
      severidade: "info",
      titulo: "Atenção.",
      descricao: "Salve antes de atualizar.",
      id: "dados",
    });
  });
});
