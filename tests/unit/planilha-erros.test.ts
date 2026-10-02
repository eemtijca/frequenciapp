// Diagnóstico das operações Google, com detalhe técnico somente no registro.
import { describe, expect, it } from "vitest";
import { mensagemParaRegistro } from "@/infra/planilha-erros";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";
import { ErroHttp } from "@/infra/erros";

describe("diagnóstico da planilha", () => {
  it("monta o texto do registro com frase e detalhe no limite da coluna", () => {
    const erro = new ErroGoogle(
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
