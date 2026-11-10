// Regressão da corrida entre entrada e revogação: a conta e a credencial são
// relidas dentro da transação serializável que grava a sessão, e o cookie só
// sai depois do commit.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const eventos: string[] = [];
  const estado = {
    ativo: true,
    senhaHash: "hash-antigo",
    papel: "ADMIN",
    revogadaEm: null as Date | null,
    expiraEm: new Date("2099-01-01"),
    primeiroUsoEm: new Date("2026-01-01"),
  };
  return {
    estado,
    eventos,
    conferir: vi.fn(),
    criar: vi.fn(async () => {
      eventos.push("sessao");
    }),
    cookie: vi.fn(async () => {
      eventos.push("cookie");
    }),
    limpar: vi.fn(async () => undefined),
    transacao: vi.fn(),
    opcoes: vi.fn(),
    aoAbrirTransacao: () => undefined as void,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: h.cookie }),
}));

vi.mock("@/infra/banco", () => {
  const clienteTx = {
    usuario: {
      findUnique: async () => ({
        id: "u",
        nome: "Equipe fictícia",
        email: "equipe@escola.exemplo",
        papel: h.estado.papel,
        ativo: h.estado.ativo,
        senhaHash: h.estado.senhaHash,
      }),
    },
    credencialDiretor: {
      findUnique: async () => ({
        expiraEm: h.estado.expiraEm,
        revogadaEm: h.estado.revogadaEm,
        trocaObrigatoria: false,
        primeiroUsoEm: h.estado.primeiroUsoEm,
      }),
      update: async () => {
        h.eventos.push("primeiroUso");
      },
    },
    sessao: { create: h.criar },
  };
  const cliente = {
    ...clienteTx,
    usuario: {
      ...clienteTx.usuario,
      findFirst: async () => ({
        id: "u",
        nome: "Equipe fictícia",
        email: "equipe@escola.exemplo",
        papel: h.estado.papel,
        ativo: h.estado.ativo,
        senhaHash: h.estado.senhaHash,
      }),
    },
    $transaction: h.transacao,
  };
  h.transacao.mockImplementation(
    async (acao: (tx: typeof clienteTx) => Promise<unknown>, opcoes: unknown) => {
      h.opcoes(opcoes);
      h.eventos.push("transacao");
      h.aoAbrirTransacao();
      const resultado = await acao(clienteTx);
      if (
        typeof resultado === "object" &&
        resultado !== null &&
        "ok" in resultado &&
        resultado.ok
      ) {
        h.eventos.push("commit");
      }
      return resultado;
    },
  );
  return {
    banco: () => cliente,
    transacaoCorrente: () => undefined,
  };
});

vi.mock("@/infra/auth/hash", () => ({
  conferirSenha: h.conferir,
  hashearSenha: async () => "hash-novo",
}));

vi.mock("@/infra/auth/limite", () => ({
  limiteDeTentativas: async () => true,
  limparTentativas: h.limpar,
}));

vi.mock("@/application/parametros-acesso", () => ({
  lerParametrosAcesso: async () => ({
    janelaMinutos: 15,
    tentativasPorOrigem: 10,
    tentativasPorLogin: 30,
    sessaoDiretorHoras: 12,
  }),
}));

import { entrar } from "@/application/sessao";

beforeEach(() => {
  vi.clearAllMocks();
  h.eventos.length = 0;
  h.estado.ativo = true;
  h.estado.senhaHash = "hash-antigo";
  h.estado.papel = "ADMIN";
  h.estado.revogadaEm = null;
  h.aoAbrirTransacao = () => undefined;
  h.conferir.mockResolvedValue(true);
  vi.spyOn(Math, "random").mockReturnValue(1);
});

describe("entrada transacional", () => {
  it("recusa conta desativada depois da conferência de senha", async () => {
    h.aoAbrirTransacao = () => {
      h.estado.ativo = false;
    };
    const resultado = await entrar(
      { login: "equipe@escola.exemplo", senha: "ficticia" },
      "sintetico",
      false,
      "local",
    );
    expect(resultado).toMatchObject({ ok: false, status: 403 });
    expect(h.criar).not.toHaveBeenCalled();
    expect(h.cookie).not.toHaveBeenCalled();
  });

  it("recusa diretor revogado depois da conferência de senha", async () => {
    h.estado.papel = "DIRETOR_TURMA";
    h.aoAbrirTransacao = () => {
      h.estado.revogadaEm = new Date();
    };
    const resultado = await entrar(
      { login: "equipe@escola.exemplo", senha: "ficticia" },
      "sintetico",
      false,
      "local",
    );
    expect(resultado).toMatchObject({ ok: false, status: 403 });
    expect(resultado.ok ? "" : resultado.erro).toContain("Acesso encerrado");
    expect(h.criar).not.toHaveBeenCalled();
  });

  it("recusa senha trocada entre a conferência e a transação", async () => {
    h.aoAbrirTransacao = () => {
      h.estado.senhaHash = "hash-novo";
    };
    const resultado = await entrar(
      { login: "equipe@escola.exemplo", senha: "ficticia" },
      "sintetico",
      false,
      "local",
    );
    expect(resultado).toMatchObject({ ok: false, status: 401 });
    expect(h.criar).not.toHaveBeenCalled();
  });

  it("grava a sessão na transação e só define o cookie depois do commit", async () => {
    const resultado = await entrar(
      { login: "equipe@escola.exemplo", senha: "ficticia" },
      "sintetico",
      false,
      "local",
    );
    expect(resultado.ok).toBe(true);
    expect(h.opcoes).toHaveBeenCalledWith(
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
    expect(h.criar).toHaveBeenCalledOnce();
    const posicaoCommit = h.eventos.indexOf("commit");
    const posicaoCookie = h.eventos.indexOf("cookie");
    expect(posicaoCommit).toBeGreaterThanOrEqual(0);
    expect(posicaoCookie).toBeGreaterThan(posicaoCommit);
  });
});
