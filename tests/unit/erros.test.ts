// Tradução de erros: cada falha conhecida vira mensagem em português
// com status adequado. Nada técnico vaza para o usuário.
import { describe, expect, it } from "vitest";
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/client";
import { ErroHttp, ehConflitoDeSerializacao, ehDuplicidade, traduzirErro } from "@/infra/erros";

function erroConhecido(
  code: string,
  meta?: Record<string, unknown>,
): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError("prisma", {
    code,
    clientVersion: "7.10.0",
    meta,
  });
}

describe("traduzirErro", () => {
  it("preserva mensagens e status de ErroHttp", () => {
    const resultado = traduzirErro(new ErroHttp("Turma não encontrada.", 404));
    expect(resultado).toEqual({ mensagem: "Turma não encontrada.", status: 404 });
  });

  it("traduz duplicidade de e-mail (P2002)", () => {
    const resultado = traduzirErro(erroConhecido("P2002", { target: ["email"] }));
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("e-mail");
  });

  it("traduz duplicidade de turma pela restrição funcional", () => {
    const resultado = traduzirErro(erroConhecido("P2002", { target: "turmas_serie_nome_unico" }));
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("turma");
  });

  it("traduz duplicidade da frequencia do dia", () => {
    const resultado = traduzirErro(
      erroConhecido("P2002", { target: ["frequencias_professor_id_turma_id_dia_key"] }),
    );
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("frequencia");
  });

  it("traduz registro em uso (P2003) por chave estrangeira", () => {
    const resultado = traduzirErro(erroConhecido("P2003", { field_name: "turmas_turma_id_fkey" }));
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("alunos ou frequencias");
  });

  it("traduz P2003 desconhecida com mensagem genérica de uso", () => {
    const resultado = traduzirErro(erroConhecido("P2003", { field_name: "outra_fkey" }));
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("em uso");
  });

  it("traduz registro sumido (P2025)", () => {
    const resultado = traduzirErro(erroConhecido("P2025"));
    expect(resultado.status).toBe(404);
  });

  it("traduz banco ocupado (P2024)", () => {
    const resultado = traduzirErro(erroConhecido("P2024"));
    expect(resultado.status).toBe(503);
  });

  it("traduz conflito de serialização (P2034)", () => {
    const resultado = traduzirErro(erroConhecido("P2034"));
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("salvou os mesmos dados");
  });

  it("traduz corpo fora do formato (validação do Prisma)", () => {
    const resultado = traduzirErro(
      new PrismaClientValidationError("prisma", { clientVersion: "7.10.0" }),
    );
    expect(resultado.status).toBe(400);
  });

  it("traduz falha de conexão com mensagem de banco indisponível", () => {
    const resultado = traduzirErro(
      new PrismaClientInitializationError("prisma", "7.10.0", "P1001"),
    );
    expect(resultado.status).toBe(503);
    expect(resultado.mensagem).toContain("banco de dados");
  });

  it("traduz erro desconhecido sem vazar detalhes", () => {
    const resultado = traduzirErro(new TypeError("detalhe interno sensível"));
    expect(resultado.status).toBe(500);
    expect(resultado.mensagem).not.toContain("detalhe interno");
    expect(resultado.mensagem).toContain("inesperado");
  });
});

describe("classificadores", () => {
  it("identifica serialização e duplicidade", () => {
    expect(ehConflitoDeSerializacao(erroConhecido("P2034"))).toBe(true);
    expect(ehConflitoDeSerializacao(erroConhecido("P2002"))).toBe(false);
    expect(ehDuplicidade(erroConhecido("P2002"))).toBe(true);
    expect(ehDuplicidade(erroConhecido("P2034"))).toBe(false);
    expect(ehDuplicidade(new Error("x"))).toBe(false);
  });
});
