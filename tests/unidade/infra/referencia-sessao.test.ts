// Exercita a consulta de sessão com cookies e registros sintéticos, sem banco.
import { createHash, createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/sessao/route";

const d = vi.hoisted(() => {
  const registros = new Map<string, unknown>();
  return {
    segredo: "segredo-sintetico-exclusivo-deste-teste",
    cookie: "",
    registros,
    consultarRegistro: vi.fn(
      async ({ where }: { where: { tokenHash: string } }) => registros.get(where.tokenHash) ?? null,
    ),
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (d.cookie ? { value: d.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    sessao: {
      findUnique: d.consultarRegistro,
    },
  }),
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: { authSecret: d.segredo } }));

const usuario = {
  id: "conta-sintetica",
  nome: "Pessoa fictícia",
  email: "exemplo@example.test",
  papel: "COORDENACAO",
  ativo: true,
};

function sessaoSintetica(id: string, token: string) {
  const assinatura = createHmac("sha256", d.segredo).update(token).digest("hex").slice(0, 32);
  const cookie = `${token}.${assinatura}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  d.registros.set(tokenHash, { id, usuario, expiraEm: new Date("2099-01-01") });
  return { cookie, valoresInternos: [id, token, assinatura, cookie, tokenHash, d.segredo] };
}

function consultar(optar = true) {
  return GET(
    new Request("http://teste.local/api/auth/sessao", {
      headers: optar ? { "X-Frequenciapp-Referencia-Sessao": "1" } : {},
    }),
  );
}

it("só inclui referência opaca quando pedida e distingue sessões da mesma conta", async () => {
  const primeira = sessaoSintetica("registro-sintetico-um", "a".repeat(64));
  const segunda = sessaoSintetica("registro-sintetico-dois", "b".repeat(64));
  d.cookie = primeira.cookie;
  expect(await (await consultar(false)).json()).toEqual({ usuario });
  const resposta = await consultar();
  expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  expect(resposta.headers.has("Set-Cookie")).toBe(false);
  const corpo = await resposta.text();
  const dados = JSON.parse(corpo) as { referenciaSessao?: string };
  expect(dados).toEqual({ usuario, referenciaSessao: expect.stringMatching(/^[\w-]{43}$/) });
  expect(primeira.valoresInternos.some((valor) => corpo.includes(valor))).toBe(false);
  expect(await (await consultar()).json()).toEqual(dados);

  d.cookie = segunda.cookie;
  const corpoDaOutra = await (await consultar()).text();
  const outrosDados = JSON.parse(corpoDaOutra) as { referenciaSessao?: string };
  expect(outrosDados).toEqual({
    usuario,
    referenciaSessao: expect.stringMatching(/^[\w-]{43}$/),
  });
  expect(outrosDados.referenciaSessao).not.toBe(dados.referenciaSessao);
  expect(segunda.valoresInternos.some((valor) => corpoDaOutra.includes(valor))).toBe(false);

  d.cookie = "";
  expect(await (await consultar()).json()).toEqual({ usuario: null });
});

it.each([false, true])(
  "responde com erro JSON sem cache quando a sessão falha (referência: %s)",
  async (optar) => {
    const sessao = sessaoSintetica("registro-sintetico-com-falha", "c".repeat(64));
    d.cookie = sessao.cookie;
    d.consultarRegistro.mockRejectedValueOnce(new Error("Detalhe interno da falha sintética"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const resposta = await consultar(optar);
      expect(resposta.status).toBe(500);
      expect(resposta.headers.get("Cache-Control")).toBe("no-store");
      expect(await resposta.json()).toEqual({
        error: "Algo inesperado aconteceu. Tente novamente; se persistir, avise o suporte.",
      });
    } finally {
      log.mockRestore();
      d.cookie = "";
    }
  },
);
