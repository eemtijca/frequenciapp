// Contratos reais da integração externa, com dados QA e arquivos Google sintéticos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { criarGoogleIndicadoresFalso } from "../helpers/google-indicadores-falso";
import type { EstadoIndicadores } from "../../src/domain/indicadores";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
let google: Awaited<ReturnType<typeof criarGoogleIndicadoresFalso>>;
let admin = "";
let coordenacao = "";
let turma = "";
let aluno = "";
async function entrar(login: string, senha: string) {
  const r = await fetch(`${APP_URL}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ login, senha, lembrar: false }),
  });
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const chamar = (caminho: string, method = "GET", body?: unknown, cookie = admin) =>
  fetch(`${APP_URL}${caminho}`, {
    method,
    headers: { Origin: APP_URL, Cookie: cookie, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const estado = async () => (await (await chamar("/api/indicadores")).json()) as EstadoIndicadores;
async function limpar() {
  await cliente.query("delete from paineis_indicadores");
  await cliente.query(
    "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome='QA Indicadores'))",
  );
  await cliente.query(
    "delete from alunos where turma_id in (select id from turmas where serie_id in (select id from series where nome='QA Indicadores'))",
  );
  await cliente.query(
    "delete from turmas where serie_id in (select id from series where nome='QA Indicadores')",
  );
  await cliente.query("delete from series where nome='QA Indicadores'");
}
beforeAll(async () => {
  await cliente.connect();
  await limpar();
  google = await criarGoogleIndicadoresFalso();
  await google.conectar(cliente);
  admin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  coordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  const s = await cliente.query<{ id: string }>(
    "insert into series (nome,ordem) values ('QA Indicadores', 98) returning id",
  );
  const t = await cliente.query<{ id: string }>(
    "insert into turmas (serie_id,nome) values ($1,'A') returning id",
    [s.rows[0]?.id],
  );
  turma = t.rows[0]?.id ?? "";
  const a = await cliente.query<{ id: string }>(
    "insert into alunos (nome,turma_id,turma_original_id,ordem) values ('QA Nome privado', $1,$1,1) returning id",
    [turma],
  );
  aluno = a.rows[0]?.id ?? "";
});
afterAll(async () => {
  await limpar();
  await cliente.query(
    "update integracoes_planilha set google_refresh_token=null, google_planilha_id=null, ativa=false where id='principal'",
  );
  await cliente.end();
  await google?.fechar();
});

describe("Indicadores externos", () => {
  it("recusa coordenação, falta de sessão e origem externa", async () => {
    expect((await chamar("/api/indicadores", "GET", undefined, coordenacao)).status).toBe(403);
    expect((await chamar("/api/indicadores", "GET", undefined, "")).status).toBe(401);
    const r = await fetch(`${APP_URL}/api/indicadores/preparar`, {
      method: "POST",
      headers: { Cookie: admin, Origin: "https://externo.exemplo" },
    });
    expect(r.status).toBe(403);
    expect(google.ids()).toHaveLength(0);
  });
  it("valida opções e não ativa a agenda sem destino preparado", async () => {
    expect((await chamar("/api/indicadores", "PATCH", { ativa: true })).status).toBe(409);
    expect((await chamar("/api/indicadores", "PATCH", { ano: 1800 })).status).toBe(400);
    expect(
      (
        await chamar("/api/indicadores", "PATCH", {
          urlRelatorio: "https://lookerstudio.google.com.externo.exemplo/reporting/id",
        })
      ).status,
    ).toBe(400);
  });
  it("permite repetir uma criação recusada de forma confirmada", async () => {
    google.recusarCriacao(true);
    expect((await chamar("/api/indicadores/preparar", "POST", {})).status).toBe(409);
    expect((await estado()).criacaoPendente).toBe(false);
    google.recusarCriacao(false);
  });
  it("recupera criação de resposta perdida sem duplicar arquivos ou aceitar outro destino", async () => {
    google.perderCriacao();
    expect((await chamar("/api/indicadores/preparar", "POST", {})).status).toBe(502);
    expect((await estado()).criacaoPendente).toBe(true);
    expect(google.ids()).toHaveLength(1);
    expect((await chamar("/api/indicadores/preparar", "POST", {})).status).toBe(409);
    expect(google.ids()).toHaveLength(1);
    expect(
      (
        await chamar("/api/indicadores/recuperar", "POST", {
          endereco: "https://docs.google.com/spreadsheets/d/QA_operacional/edit",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await chamar("/api/indicadores/recuperar", "POST", {
          endereco: `https://docs.google.com/spreadsheets/d/${google.ids()[0]}/edit`,
        })
      ).status,
    ).toBe(200);
    expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(200);
    expect(google.valores("QA_operacional", 0)).toEqual([["Dados operacionais preservados"]]);
  });
  it("recusa operações concorrentes antes de falar com o Google", async () => {
    const antes = google.chamadas().length;
    await cliente.query("BEGIN");
    try {
      await cliente.query("SELECT pg_advisory_xact_lock($1::integer,1)", [0x494e4449]);
      expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(409);
      expect((await chamar("/api/indicadores", "PATCH", { ano: 2026 })).status).toBe(409);
      expect(google.chamadas()).toHaveLength(antes);
    } finally {
      await cliente.query("ROLLBACK");
    }
  });
  it("substitui correções e exclusões, sem nomes, IDs e linhas duplicadas", async () => {
    const f = await cliente.query<{ id: string }>(
      "insert into frequencias (turma_id,dia,atualizado_em) values ($1,'2026-06-15',now()) returning id",
      [turma],
    );
    await cliente.query("insert into alunos_chamada (frequencia_id,aluno_id) values ($1,$2)", [
      f.rows[0]?.id,
      aluno,
    ]);
    expect((await chamar("/api/indicadores", "PATCH", { ano: 2026 })).status).toBe(200);
    expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(200);
    const id = google.ids()[0] ?? "";
    const linhas = google.valores(id, 0);
    expect(linhas.find((l) => l[3] === "QA Indicadores")?.slice(5)).toEqual([1, 1, 0, 0, 0, 0]);
    expect(JSON.stringify(linhas)).not.toContain("QA Nome privado");
    expect(JSON.stringify(linhas)).not.toContain(aluno);
    await cliente.query("delete from frequencias where id=$1", [f.rows[0]?.id]);
    expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(200);
    expect(google.valores(id, 0).some((l) => l[3] === "QA Indicadores")).toBe(false);
    expect(google.ids()).toHaveLength(1);
  });
  it("retenta uma substituição com resposta perdida sem atualizar a data de sucesso antecipadamente", async () => {
    const antes = (await estado()).ultimoEnvioEm;
    google.perderEscrita();
    expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(502);
    expect((await estado()).ultimoEnvioEm).toBe(antes);
    expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(200);
    expect((await estado()).erro).toBeNull();
  });
  it("usa a agenda autenticada sem depender de itens na fila", async () => {
    expect((await chamar("/api/indicadores/agenda")).status).toBe(403);
    const cron = process.env.CRON_SECRET;
    expect(cron).toBeTruthy();
    const agenda = () =>
      fetch(`${APP_URL}/api/indicadores/agenda`, { headers: { Authorization: `Bearer ${cron}` } });
    expect((await agenda()).status).toBe(200);
    expect((await chamar("/api/indicadores", "PATCH", { ativa: true })).status).toBe(200);
    await cliente.query("update paineis_indicadores set ultimo_envio_em=null");
    const r = await agenda();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ atualizado: true });
    expect(await (await agenda()).json()).toEqual({ atualizado: false });
  });
  it("bloqueia alteração externa do marcador antes de escrever", async () => {
    const id = google.ids()[0] ?? "";
    google.adulterarMarcador(id);
    const antes = google.chamadas().filter((c) => c.includes(":batchUpdate")).length;
    expect((await chamar("/api/indicadores/atualizar", "POST", {})).status).toBe(409);
    expect(google.chamadas().filter((c) => c.includes(":batchUpdate")).length).toBe(antes);
  });
});
