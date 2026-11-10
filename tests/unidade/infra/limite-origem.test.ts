// Regressão do limite de entrada: a origem agrega logins distintos e o login
// agrega origens distintas, sem uma origem bloquear as outras.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const limpezas: string[] = [];
  const estado = { ativo: true, senhaHash: "hash-ficticio", papel: "ADMIN" };
  return {
    contagens: new Map<string, number>(),
    consultas: vi.fn(),
    limpezas,
    limpar: vi.fn(async (args: { where: { chave: string } }) => {
      limpezas.push(args.where.chave);
    }),
    conferir: vi.fn(),
    usuario: vi.fn(),
    sessao: vi.fn(),
    cookie: vi.fn(),
    transacao: vi.fn(),
    estado,
  };
});

vi.mock("@/infra/banco", () => {
  const cliente = {
    $queryRaw: h.consultas,
    usuario: {
      findFirst: h.usuario,
      findUnique: async () => ({
        id: "u",
        nome: "Equipe fictícia",
        email: "um@escola.exemplo",
        papel: h.estado.papel,
        ativo: h.estado.ativo,
        senhaHash: h.estado.senhaHash,
      }),
    },
    credencialDiretor: { findUnique: async () => null, update: vi.fn() },
    tentativaEntrada: { deleteMany: h.limpar },
    sessao: { create: h.sessao },
    $transaction: h.transacao,
  };
  h.transacao.mockImplementation(async (acao: (tx: typeof cliente) => Promise<unknown>) =>
    acao(cliente),
  );
  return {
    objetoDoBanco: (nome: string) => nome,
    banco: () => cliente,
    transacaoCorrente: () => undefined,
  };
});

vi.mock("@/infra/auth/hash", () => ({
  conferirSenha: h.conferir,
  hashearSenha: async () => "hash-ficticio",
}));

vi.mock("@/infra/auth/sessao", () => ({
  criarSessao: h.sessao,
  registrarSessao: h.sessao,
  gravarCookieSessao: h.cookie,
  encerrarSessao: vi.fn(),
  encerrarOutrasSessoes: vi.fn(),
  sessaoAtual: vi.fn(),
}));

vi.mock("@/application/parametros-acesso", () => ({
  lerParametrosAcesso: async () => ({
    janelaMinutos: 15,
    tentativasPorOrigem: 2,
    tentativasPorLogin: 2,
    sessaoDiretorHoras: 12,
  }),
}));

import { entrar } from "@/application/sessao";

beforeEach(() => {
  vi.clearAllMocks();
  h.contagens.clear();
  h.limpezas.length = 0;
  h.estado.ativo = true;
  h.estado.senhaHash = "hash-ficticio";
  h.estado.papel = "ADMIN";
  h.usuario.mockResolvedValue(null);
  h.conferir.mockResolvedValue(false);
  h.sessao.mockResolvedValue({
    token: "token",
    expiraEm: new Date("2099-01-01"),
    persistente: false,
  });
  h.cookie.mockResolvedValue(undefined);
  vi.spyOn(Math, "random").mockReturnValue(1);
  h.consultas.mockImplementation(async (_sql: unknown, ...valores: unknown[]) => {
    const chave = valores.find(
      (valor): valor is string => typeof valor === "string" && valor.startsWith("entrada:"),
    );
    if (!chave) throw new Error("Chave de tentativa ausente.");
    const contagem = (h.contagens.get(chave) ?? 0) + 1;
    h.contagens.set(chave, contagem);
    return [{ contagem }];
  });
});

afterEach(() => vi.restoreAllMocks());

describe("limite de entrada por origem", () => {
  it("agrega logins distintos da mesma origem", async () => {
    const resultados = [];
    for (const login of ["um@escola.exemplo", "dois@escola.exemplo", "tres@escola.exemplo"]) {
      resultados.push(await entrar({ login, senha: "ficticia" }, "sintetico", false, "origem-a"));
    }
    expect(resultados.map((resultado) => (resultado.ok ? 200 : resultado.status))).toEqual([
      401, 401, 429,
    ]);
    expect(h.contagens.get("entrada:ip:origem-a")).toBe(3);
    expect([...h.contagens.keys()].filter((chave) => chave.startsWith("entrada:ip:"))).toEqual([
      "entrada:ip:origem-a",
    ]);
  });

  it("mantém o teto por login entre origens distintas", async () => {
    const resultados = [];
    for (const origem of ["origem-a", "origem-b", "origem-c"]) {
      resultados.push(
        await entrar({ login: "um@escola.exemplo", senha: "ficticia" }, "sintetico", false, origem),
      );
    }
    expect(resultados.map((resultado) => (resultado.ok ? 200 : resultado.status))).toEqual([
      401, 401, 429,
    ]);
    expect(h.contagens.get("entrada:email:um@escola.exemplo")).toBe(3);
  });

  it("não bloqueia origens distintas com logins distintos", async () => {
    const pares = [
      ["origem-a", "um@escola.exemplo"],
      ["origem-b", "dois@escola.exemplo"],
      ["origem-c", "tres@escola.exemplo"],
    ] as const;
    const resultados = [];
    for (const [origem, login] of pares) {
      resultados.push(await entrar({ login, senha: "ficticia" }, "sintetico", false, origem));
    }
    expect(resultados.map((resultado) => (resultado.ok ? 200 : resultado.status))).toEqual([
      401, 401, 401,
    ]);
  });

  it("limpa as duas chaves depois de uma entrada confirmada", async () => {
    h.usuario.mockResolvedValue({
      id: "u",
      nome: "Equipe fictícia",
      email: "um@escola.exemplo",
      papel: "ADMIN",
      ativo: true,
      senhaHash: "hash-ficticio",
    });
    h.conferir.mockResolvedValue(true);
    const resultado = await entrar(
      { login: "um@escola.exemplo", senha: "correta" },
      "sintetico",
      false,
      "origem-a",
    );
    expect(resultado.ok).toBe(true);
    expect(h.limpezas).toEqual(["entrada:ip:origem-a", "entrada:email:um@escola.exemplo"]);
  });
});
