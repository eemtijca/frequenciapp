// Tradução de erros: cada falha conhecida vira mensagem em português
// com status adequado. Nada técnico vaza para o usuário.
import { describe, expect, it, vi } from "vitest";
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

  it("traduz duplicidade da frequência do dia", () => {
    const resultado = traduzirErro(
      erroConhecido("P2002", { target: ["frequencias_turma_id_dia_key"] }),
    );
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("frequência");
  });

  it("traduz registro em uso (P2003) por chave estrangeira", () => {
    const resultado = traduzirErro(erroConhecido("P2003", { field_name: "turmas_turma_id_fkey" }));
    expect(resultado.status).toBe(409);
    expect(resultado.mensagem).toContain("alunos ou frequências");
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

  it("traduz EAUTHQUERY do adaptador sem vazar a conexão na resposta ou no log", () => {
    const conexao = "postgresql://qa_usuario:qa_senha@banco.exemplo/postgres?schema=qa_preview";
    const mensagem = `(EAUTHQUERY) user not found in the database: ${conexao}`;
    const adaptador = new Error(mensagem, {
      cause: { kind: "postgres", code: "XX000", originalMessage: mensagem },
    });
    adaptador.name = "DriverAdapterError";
    const erro = new PrismaClientKnownRequestError(mensagem, {
      code: "P2039",
      clientVersion: "7.10.0",
      meta: { modelName: "ParametrosAcesso", driverAdapterError: adaptador },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const resultado = traduzirErro(erro);
      expect(resultado).toEqual({
        mensagem: "Não foi possível falar com o banco de dados. Contate o suporte técnico.",
        status: 503,
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "[banco] EAUTHQUERY: usuário de conexão não encontrado. Conferir o usuário de DATABASE_URL e o pooler no ambiente afetado, inclusive no escopo Preview da Vercel.",
      );
      const saida = JSON.stringify({ resultado, logs: log.mock.calls });
      for (const detalhe of [conexao, "qa_usuario", "qa_senha", "banco.exemplo", "qa_preview"]) {
        expect(saida).not.toContain(detalhe);
      }
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    new Error("(EAUTHQUERY) user not found in the database"),
    new Error("Falha do adaptador", {
      cause: {
        code: "XX000",
        originalMessage: "(EAUTHQUERY) user not found in the database",
      },
    }),
  ])("reconhece EAUTHQUERY restrito aos detalhes do adaptador: %s", (driverAdapterError) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(traduzirErro(erroConhecido("P2039", { driverAdapterError })).status).toBe(503);
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    { code: "XX000", originalMessage: "Erro interno do banco" },
    { code: "XX000", originalMessage: "user not found in the database" },
    { code: "XX000", originalMessage: "(EAUTHQUERY) outra falha" },
    undefined,
  ])("preserva P2039 sem a assinatura de usuário ausente como erro inesperado", (cause) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const driverAdapterError = new Error("Falha do adaptador", { cause });
      expect(traduzirErro(erroConhecido("P2039", { driverAdapterError })).status).toBe(500);
    } finally {
      log.mockRestore();
    }
  });

  it("preserva conflitos mesmo quando o detalhe contém a assinatura de EAUTHQUERY", () => {
    const driverAdapterError = new Error("(EAUTHQUERY) user not found in the database");
    expect(traduzirErro(erroConhecido("P2034", { driverAdapterError })).status).toBe(409);
  });

  it("encerra a inspeção de causas circulares sem classificar outro P2039 como autenticação", () => {
    const driverAdapterError = new Error("Falha do adaptador");
    driverAdapterError.cause = driverAdapterError;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(traduzirErro(erroConhecido("P2039", { driverAdapterError })).status).toBe(500);
    } finally {
      log.mockRestore();
    }
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
