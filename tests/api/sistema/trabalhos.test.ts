// Contrato administrativo da fila genérica: leitura, permissões e recusa sem Redis.
import { describe, expect, it } from "vitest";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const EMAIL_COORDENACAO = process.env.TESTE_COORDENACAO_EMAIL ?? "demo@escola.exemplo";
const SENHA_COORDENACAO = process.env.TESTE_COORDENACAO_SENHA ?? "DemoFrequencia2026";
const FILA_REDIS = process.env.FILA_DRIVER === "redis";

async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha, lembrar: false }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function chamar(
  caminho: string,
  metodo: "GET" | "POST",
  cookie: string,
  corpo?: unknown,
): Promise<Response> {
  return fetch(`${APP_URL}${caminho}`, {
    method: metodo,
    headers: {
      Origin: APP_URL,
      Cookie: cookie,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

describe("GET /api/trabalhos", () => {
  it("exige sessão administrativa", async () => {
    const semSessao = await fetch(`${APP_URL}/api/trabalhos`);
    expect(semSessao.status).toBe(401);

    const coordenacao = await entrar(EMAIL_COORDENACAO, SENHA_COORDENACAO);
    const recusado = await chamar("/api/trabalhos", "GET", coordenacao);
    expect(recusado.status).toBe(403);
  });

  it("lista trabalhos e contagens para a administração", async () => {
    const admin = await entrar(EMAIL_ADMIN, SENHA_ADMIN);
    const resposta = await chamar("/api/trabalhos?limite=10", "GET", admin);
    expect(resposta.status).toBe(200);
    const dados = (await resposta.json()) as {
      itens: unknown[];
      total: number;
      contagens: Record<string, number>;
    };
    expect(Array.isArray(dados.itens)).toBe(true);
    expect(dados.total).toBeGreaterThanOrEqual(0);
    expect(dados.contagens).toHaveProperty("PENDENTE");
    expect(dados.contagens).toHaveProperty("CONCLUIDO");
  });

  it("recusa filtros inválidos e identificador ausente", async () => {
    const admin = await entrar(EMAIL_ADMIN, SENHA_ADMIN);
    expect((await chamar("/api/trabalhos?estado=INVALIDO", "GET", admin)).status).toBe(400);
    expect(
      (await chamar("/api/trabalhos/00000000-0000-0000-0000-000000000000", "GET", admin)).status,
    ).toBe(404);
  });
});

describe.skipIf(FILA_REDIS)("POST /api/trabalhos/indicadores", () => {
  it("recusa o enfileiramento quando a fila Redis não está habilitada", async () => {
    const admin = await entrar(EMAIL_ADMIN, SENHA_ADMIN);
    const resposta = await chamar("/api/trabalhos/indicadores", "POST", admin, {});
    expect(resposta.status).toBe(409);
  });
});
