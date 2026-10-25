// Privacidade nas exportações: senha da cópia, limites, CSRF, papéis e
// auditoria mínima contra a API e PostgreSQL reais, com conta própria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const URL_APP = process.env.APP_URL ?? "http://localhost:3000";
const SENHA = "QA Exportacao Exclusiva 2026";
const EMAIL = "qa-exportacoes@escola.exemplo";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let admin = "";
let coordenacao = "";
let usuarioId = "";

async function chamar(caminho: string, cookie = admin, corpo?: unknown, origem = URL_APP) {
  return fetch(`${URL_APP}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { Cookie: cookie, Origin: origem, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}
async function entrar(email: string, senha: string) {
  const resposta = await chamar("/api/auth/entrar", "", { email, senha });
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function limparTentativas() {
  await banco.query("delete from tentativas_entrada where chave = $1", [
    `backup:exportar:${usuarioId}`,
  ]);
}

beforeAll(async () => {
  await banco.connect();
  await banco.query("delete from usuarios where email = $1", [EMAIL]);
  const gestor = await entrar(
    process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
    process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  );
  const criada = await chamar("/api/usuarios", gestor, {
    nome: "QA Exportacoes",
    email: EMAIL,
    senha: SENHA,
    papel: "ADMIN",
  });
  expect(criada.status).toBe(201);
  usuarioId = ((await criada.json()) as { usuario: { id: string } }).usuario.id;
  admin = await entrar(EMAIL, SENHA);
  coordenacao = await entrar(
    process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
    process.env.TESTE_SENHA ?? "DemoFrequencia2026",
  );
});
afterAll(async () => {
  await limparTentativas();
  await banco.query("delete from auditoria where usuario_id = $1", [usuarioId]);
  await banco.query("delete from usuarios where email = $1", [EMAIL]);
  await banco.query("delete from tentativas_entrada where chave like '%qa-exportacoes%'");
  await banco.end();
});

describe("cópia completa exige confirmação de acesso", () => {
  it("recusa exportação antiga por GET sem devolver o documento", async () => {
    const resposta = await chamar("/api/backup");
    expect(resposta.status).toBe(405);
    expect(await resposta.json()).not.toHaveProperty("alunos");
  });
  it("nega ausência de sessão, coordenação e origem de outro site", async () => {
    expect((await chamar("/api/backup/exportar", "", { senha: SENHA })).status).toBe(401);
    expect((await chamar("/api/backup/exportar", coordenacao, { senha: SENHA })).status).toBe(403);
    expect(
      (await chamar("/api/backup/exportar", admin, { senha: SENHA }, "https://outro.exemplo"))
        .status,
    ).toBe(403);
  });
  it("rejeita senha ausente e campos adicionais", async () => {
    for (const corpo of [
      {},
      { senha: "" },
      { senha: SENHA, senhaZip: "Não deve ser transmitida" },
    ]) {
      const resposta = await chamar("/api/backup/exportar", admin, corpo);
      expect(resposta.status).toBe(400);
      expect(await resposta.json()).not.toHaveProperty("alunos");
    }
  });
  it("limita cinco tentativas incorretas e bloqueia a sexta", async () => {
    try {
      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        const resposta = await chamar("/api/backup/exportar", admin, { senha: "incorreta" });
        expect(resposta.status).toBe(400);
        expect(await resposta.json()).not.toHaveProperty("alunos");
      }
      const limitada = await chamar("/api/backup/exportar", admin, { senha: SENHA });
      expect(limitada.status).toBe(429);
      expect(await limitada.json()).not.toHaveProperty("alunos");
    } finally {
      await limparTentativas();
    }
  });
  it("entrega a cópia com senha correta, sem cache nem credenciais", async () => {
    const resposta = await chamar("/api/backup/exportar", admin, { senha: SENHA });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const dados = await resposta.json();
    expect(dados).toHaveProperty("alunos");
    expect(dados).not.toHaveProperty("usuarios");
    expect(JSON.stringify(dados)).not.toContain(SENHA);
    const auditoria = await banco.query("select acao, alvo from auditoria where usuario_id = $1", [
      usuarioId,
    ]);
    expect(auditoria.rows).toContainEqual({ acao: "backup.exportar", alvo: "copia" });
    expect(JSON.stringify(auditoria.rows)).not.toContain(SENHA);
  });
});

describe("registro de exportação CSV", () => {
  it("registra apenas conta, tipo, formato e data, sem conteúdo", async () => {
    for (const tipo of ["grade", "relacao"]) {
      for (const formato of ["original", "zip"]) {
        const resposta = await chamar("/api/exportacoes/registro", admin, { tipo, formato });
        expect(resposta.status).toBe(200);
      }
    }
    const { rows } = await banco.query(
      "select acao, alvo from auditoria where usuario_id = $1 and acao = 'download.preparar' order by alvo",
      [usuarioId],
    );
    expect(rows).toEqual([
      { acao: "download.preparar", alvo: "grade:original" },
      { acao: "download.preparar", alvo: "grade:zip" },
      { acao: "download.preparar", alvo: "relacao:original" },
      { acao: "download.preparar", alvo: "relacao:zip" },
    ]);
  });
  it("coordenação pode registrar somente grade, e exige origem e sessão válidas", async () => {
    const corpo = { tipo: "grade", formato: "zip" };
    expect((await chamar("/api/exportacoes/registro", "", corpo)).status).toBe(401);
    expect(
      (await chamar("/api/exportacoes/registro", admin, corpo, "https://outro.exemplo")).status,
    ).toBe(403);
    expect((await chamar("/api/exportacoes/registro", coordenacao, corpo)).status).toBe(200);
    expect(
      (await chamar("/api/exportacoes/registro", coordenacao, { ...corpo, tipo: "relacao" }))
        .status,
    ).toBe(403);
  });
  it("nega nomes, conteúdo, senha e tipos desconhecidos sem gravar evento", async () => {
    for (const extra of [
      { nome: "QA Estudante" },
      { conteudo: "CSV" },
      { senha: SENHA },
      { tipo: "copia" },
    ]) {
      expect(
        (
          await chamar("/api/exportacoes/registro", admin, {
            tipo: "grade",
            formato: "zip",
            ...extra,
          })
        ).status,
      ).toBe(400);
    }
    const registro = await banco.query(
      "select count(*)::int as total from auditoria where usuario_id = $1 and acao = 'download.preparar'",
      [usuarioId],
    );
    expect(registro.rows[0]?.total).toBe(4);
  });
});
