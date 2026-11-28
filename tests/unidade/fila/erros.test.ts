// Mensagens de erro dos trabalhos: o detalhe técnico não chega ao banco nem à interface.
import { afterEach, describe, expect, it, vi } from "vitest";
import { resultadoDeErro } from "@/application/trabalhos/erros";
import { ErroHttp } from "@/infra/erros";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resultado de erro dos trabalhos", () => {
  it("não copia a mensagem original para o resumo público", () => {
    const ruido = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resultado = resultadoDeErro(new Error("select * from alunos where nome = 'QA'"), {
      incerto: false,
      resultado: "falhou",
    });
    expect(resultado).toMatchObject({
      situacao: "retentavel",
      resultado: "falhou",
      erroCodigo: "falha_temporaria",
    });
    expect(resultado.erroResumo).not.toContain("select");
    expect(resultado.erroResumo).not.toContain("QA");
    expect(ruido).toHaveBeenCalled();
  });

  it("traduz validação, incerteza e falha temporária em frases curtas", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      resultadoDeErro(new ErroHttp("Turma não encontrada.", 404, "turma"), {
        incerto: true,
        resultado: "preparacao_falhou",
      }),
    ).toMatchObject({ situacao: "falhou", resultado: "validacao", erroCodigo: "turma" });
    expect(
      resultadoDeErro(new Error("socket fechado"), {
        incerto: true,
        resultado: "preparacao_falhou",
      }),
    ).toMatchObject({ situacao: "conferencia", erroCodigo: "efeito_incerto" });
    expect(
      resultadoDeErro(new Error("socket fechado"), {
        incerto: false,
        resultado: "indicadores_falharam",
      }),
    ).toMatchObject({ situacao: "retentavel", erroCodigo: "falha_temporaria" });
  });
});
