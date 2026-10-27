// Contrato da confirmação da própria senha: sessão, erro e limite de tentativas.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { hashearSenha } from "@/infra/auth/hash";

const url = process.env.APP_URL ?? "http://localhost:3000";
const email = "qa-confirmar-senha@escola.exemplo";
const senha = "SenhaQA2026";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookie = "";
let usuarioId = "";

async function chamar(corpo: unknown, comCookie = true) {
  return fetch(`${url}/api/conta/confirmar-senha`, {
    method: "POST",
    headers: {
      Origin: url,
      "Content-Type": "application/json",
      ...(comCookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

beforeAll(async () => {
  await banco.connect();
  await banco.query("delete from usuarios where email = $1", [email]);
  const criado = await banco.query<{ id: string }>(
    `insert into usuarios (email, senha_hash, nome, papel, atualizado_em)
     values ($1, $2, 'QA Confirmar Senha', 'COORDENACAO', now()) returning id`,
    [email, await hashearSenha(senha)],
  );
  usuarioId = criado.rows[0]?.id ?? "";
  const resposta = await fetch(`${url}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(resposta.status).toBe(200);
  cookie = resposta.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");
});

afterAll(async () => {
  await banco.query("delete from tentativas_entrada where chave like $1", [
    `conta:confirmar-senha:${usuarioId}`,
  ]);
  await banco.query("delete from usuarios where email = $1", [email]);
  await banco.end();
});

describe("confirmação da própria senha", () => {
  it("aceita a senha correta", async () => {
    const resposta = await chamar({ senha });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toContain("no-store");
    expect(await resposta.json()).toEqual({ ok: true });
  });

  it("recusa senha incorreta e corpo inválido", async () => {
    const errada = await chamar({ senha: "senha-errada" });
    expect(errada.status).toBe(400);
    expect(await errada.json()).toMatchObject({ error: "Senha incorreta." });

    const vazia = await chamar({ senha: "" });
    expect(vazia.status).toBe(400);
  });

  it("exige sessão", async () => {
    const resposta = await chamar({ senha }, false);
    expect(resposta.status).toBe(401);
  });

  it("limita cinco tentativas por conta", async () => {
    await banco.query("delete from tentativas_entrada where chave like $1", [
      `conta:confirmar-senha:${usuarioId}`,
    ]);
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const resposta = await chamar({ senha: "senha-errada" });
      expect(resposta.status).toBe(400);
    }
    const limitada = await chamar({ senha });
    expect(limitada.status).toBe(429);
    expect(await limitada.json()).toMatchObject({
      error: "Muitas tentativas incorretas. Aguarde alguns minutos.",
    });
  });
});
