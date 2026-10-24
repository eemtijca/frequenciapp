// Avisos de erro: a dica de internet só aparece em falha de rede ou servidor,
// nunca em regra de negócio 4xx.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { erro } = vi.hoisted(() => ({ erro: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    error: erro,
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { avisarErro } from "@/lib/avisos";
import { ErroApi } from "@/lib/api-cliente";

describe("avisarErro", () => {
  beforeEach(() => {
    erro.mockClear();
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
    expect(erro).toHaveBeenCalledTimes(1);
    const [titulo, opcoes] = erro.mock.calls[0] ?? [];
    expect(titulo).toBe("Esta justificativa está em uso em 2 registros.");
    expect(opcoes.description).toBeUndefined();
    expect(JSON.stringify(opcoes)).not.toContain("internet");
    expect(JSON.stringify(opcoes)).not.toContain("chamada");
  });

  it("sugere tentar de novo em falha de servidor", () => {
    avisarErro(new ErroApi("Serviço indisponível.", 503), {
      contexto: "Não foi possível carregar.",
    });
    expect(erro).toHaveBeenCalledWith(
      "Serviço indisponível.",
      expect.objectContaining({ description: "Tente de novo em instantes." }),
    );
  });

  it("sugere conferir a internet em falha desconhecida", () => {
    avisarErro(new TypeError("Failed to fetch"), {
      contexto: "Não foi possível carregar os dados.",
    });
    expect(erro).toHaveBeenCalledWith(
      "Não foi possível carregar os dados.",
      expect.objectContaining({
        description: "Confira a internet e tente de novo em instantes.",
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
    expect(erro).toHaveBeenCalledWith(
      "Falha passageira.",
      expect.objectContaining({
        description: "A chamada continua na tela.",
        id: "salvar",
        action: expect.objectContaining({ label: "Tentar novamente" }),
      }),
    );
  });

  it("ignora a sessão expirada, que tem fluxo próprio", () => {
    avisarErro(new ErroApi("Sua sessão expirou.", 401), {
      contexto: "Não foi possível carregar.",
    });
    expect(erro).not.toHaveBeenCalled();
  });
});
