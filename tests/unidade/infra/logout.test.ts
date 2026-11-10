// Exercita revogação real e rota com banco transacional sintético, sem conexão externa.
import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => {
  const cookie = { value: "" };
  const set = vi.fn();
  const dados = { sessao: true, push: true };
  let falha = "";
  let commit = false;
  function cliente(estado: typeof dados) {
    return {
      sessao: {
        findUnique: vi.fn(async () =>
          estado.sessao
            ? {
                id: "sessao-sintetica",
                expiraEm: new Date("2099-01-01"),
                usuario: {
                  id: "u",
                  nome: "Equipe fictícia",
                  email: "equipe@escola.exemplo",
                  papel: "ADMIN",
                  ativo: true,
                },
              }
            : null,
        ),
        delete: vi.fn(async () => {
          if (falha === "sessao") throw new Error("SQL fictício privado");
          estado.sessao = false;
        }),
        deleteMany: vi.fn(async () => {
          if (falha === "sessao") throw new Error("SQL fictício privado");
          const count = Number(estado.sessao);
          estado.sessao = false;
          return { count };
        }),
      },
      assinaturaPush: {
        deleteMany: vi.fn(async () => {
          if (falha === "push") throw new Error("SQL fictício privado");
          estado.push = false;
          return { count: 1 };
        }),
      },
    };
  }
  const direto = cliente(dados);
  const transacao = vi.fn(async (acao: (tx: ReturnType<typeof cliente>) => Promise<unknown>) => {
    const trabalho = { ...dados };
    const resultado = await acao(cliente(trabalho));
    if (falha === "commit") throw new Error("SQL fictício privado");
    Object.assign(dados, trabalho);
    commit = true;
    return resultado;
  });
  return {
    cookie,
    set,
    dados,
    direto,
    transacao,
    banco: { ...direto, $transaction: transacao },
    falhar: (v: string) => {
      falha = v;
    },
    confirmou: () => commit,
    reiniciar: () => {
      dados.sessao = true;
      dados.push = true;
      falha = "";
      commit = false;
    },
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (d.cookie.value ? d.cookie : undefined), set: d.set }),
}));
vi.mock("@/infra/banco", () => ({ banco: () => d.banco, transacaoCorrente: () => undefined }));
vi.mock("@/infra/ambiente", () => ({
  ambiente: { authSecret: "segredo-sintetico", cookiesSeguros: true },
}));
vi.mock("@/application/sessao", () => ({
  sair: (segredo: string, seguro: boolean) => encerrarSessao(segredo, seguro),
  identidadeAtual: vi.fn(),
}));
import { encerrarSessao, sessaoAtual } from "@/infra/auth/sessao";
import { POST } from "@/app/api/auth/sair/route";
const segredo = "segredo-sintetico";
const token = "token-ficticio";
const assinado = `${token}.${createHmac("sha256", segredo).update(token).digest("hex").slice(0, 32)}`;

beforeEach(() => {
  vi.clearAllMocks();
  d.reiniciar();
  d.cookie.value = assinado;
});
describe("logout fiel", () => {
  for (const falha of ["sessao", "push", "commit"]) {
    it(`não anuncia sucesso nem perde cookie na falha de ${falha}`, async () => {
      d.falhar(falha);
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const resposta = await POST(
          new Request("http://teste.local/api/auth/sair", { method: "POST" }),
        );
        expect(resposta.status).toBe(500);
        const corpo = await resposta.json();
        expect(corpo.ok).not.toBe(true);
        expect(JSON.stringify(corpo)).not.toContain("SQL");
        expect(d.set).not.toHaveBeenCalled();
        expect(d.dados).toEqual({ sessao: true, push: true });
        d.falhar("");
        const repeticao = await POST(
          new Request("http://teste.local/api/auth/sair", { method: "POST" }),
        );
        expect(repeticao.status).toBe(200);
        expect(d.dados).toEqual({ sessao: false, push: false });
      } finally {
        log.mockRestore();
      }
    });
  }
  it("só limpa o cookie depois do commit e invalida o token", async () => {
    d.set.mockImplementation(() => {
      expect(d.confirmou()).toBe(true);
    });
    await encerrarSessao(segredo, true);
    expect(d.transacao).toHaveBeenCalledOnce();
    expect(d.set).toHaveBeenCalledWith(
      "frequenciapp_sessao",
      "",
      expect.objectContaining({ maxAge: 0, secure: true }),
    );
    await expect(sessaoAtual(segredo)).resolves.toBeNull();
    expect(d.direto.sessao.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      }),
    );
    d.set.mockReset();
    await expect(encerrarSessao(segredo, true)).resolves.toBeUndefined();
  });
  for (const valor of ["", "invalido", "token.assinatura-incorreta"]) {
    it(`descarta cookie ausente ou inválido sem consultar banco: ${valor || "ausente"}`, async () => {
      d.set.mockReset();
      d.cookie.value = valor;
      await expect(encerrarSessao(segredo, true)).resolves.toBeUndefined();
      expect(d.transacao).not.toHaveBeenCalled();
      expect(d.direto.sessao.findUnique).not.toHaveBeenCalled();
      expect(d.set).toHaveBeenCalledOnce();
    });
  }
});
