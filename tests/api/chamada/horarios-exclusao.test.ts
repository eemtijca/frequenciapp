// Exclusão de aula com e sem faltas, com retrato de chamada e sob concorrência.
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Exclusão de Aula";
const dia = "2026-06-15";
const outroDia = "2026-06-16";
let cookieAdmin = "";
let cookieEquipe = "";
let serieId = "";
let turmaId = "";
let alunoId = "";
let aulas: string[] = [];

async function chamar(caminho: string, metodo = "GET", corpo?: unknown, sessao = cookieEquipe) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: sessao, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function limpar() {
  if (turmaId) await banco.query("delete from frequencias where turma_id = $1", [turmaId]);
  if (turmaId) await banco.query("delete from horarios where turma_id = $1", [turmaId]);
  await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  if (turmaId) await banco.query("delete from turmas where id = $1", [turmaId]);
  if (serieId) await banco.query("delete from series where id = $1", [serieId]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  for (const [papel, email, senha] of [
    [
      "admin",
      process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
      process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
    ],
    [
      "equipe",
      process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
      process.env.TESTE_SENHA ?? "DemoFrequencia2026",
    ],
  ] as const) {
    const resposta = await chamar("/api/auth/entrar", "POST", { email, senha }, "");
    expect(resposta.status).toBe(200);
    const sessao = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (papel === "admin") cookieAdmin = sessao;
    else cookieEquipe = sessao;
  }
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 98) returning id",
    [prefixo],
  );
  serieId = serie.rows[0]?.id ?? "";
  const turma = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome, criado_em) values ($1, 'A', $2) returning id",
    [serieId, new Date("2026-01-05T12:00:00Z")],
  );
  turmaId = turma.rows[0]?.id ?? "";
  const aluno = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem, criado_em) values ($1, $2, $2, 1, $3) returning id",
    [`${prefixo} Aluno`, turmaId, new Date("2026-02-01T12:00:00Z")],
  );
  alunoId = aluno.rows[0]?.id ?? "";
});

beforeEach(async () => {
  await limpar();
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 98) returning id",
    [prefixo],
  );
  serieId = serie.rows[0]?.id ?? "";
  const turma = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome, criado_em) values ($1, 'A', $2) returning id",
    [serieId, new Date("2026-01-05T12:00:00Z")],
  );
  turmaId = turma.rows[0]?.id ?? "";
  const aluno = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem, criado_em) values ($1, $2, $2, 1, $3) returning id",
    [`${prefixo} Aluno`, turmaId, new Date("2026-02-01T12:00:00Z")],
  );
  alunoId = aluno.rows[0]?.id ?? "";
  aulas = (
    await banco.query<{ id: string }>(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) select $1, n, '07:00', '07:50', array[1,2,3,4,5] from generate_series(1, 4) n returning id",
      [turmaId],
    )
  ).rows.map((item) => item.id);
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

function aulaDe(indice: number): string {
  const id = aulas[indice];
  if (!id) throw new Error("Aula sintética ausente.");
  return id;
}

async function desativarExceto(manter: string[]) {
  await banco.query("update horarios set ativo = (id = any($2::uuid[])) where turma_id = $1", [
    turmaId,
    manter,
  ]);
}

async function salvar(data: string, faltas: unknown[] = []) {
  return chamar("/api/frequencias", "POST", {
    dia: data,
    turmaId,
    faltas,
    revisao: 0,
    confirmarHistorico: true,
    motivo: "Teste sintético da exclusão de aula",
  });
}

it("exclui aula sem faltas e sem retrato", async () => {
  const resposta = await chamar(`/api/horarios/${aulaDe(0)}`, "DELETE", undefined, cookieAdmin);
  expect(resposta.status).toBe(200);
  const restantes = await banco.query("select id from horarios where id = $1", [aulaDe(0)]);
  expect(restantes.rowCount).toBe(0);
});

it("recusa aula que aparece no retrato mesmo sem faltas", async () => {
  await desativarExceto([aulaDe(0)]);
  expect((await salvar(dia)).status).toBe(200);
  const resposta = await chamar(`/api/horarios/${aulaDe(0)}`, "DELETE", undefined, cookieAdmin);
  expect(resposta.status).toBe(409);
  expect(await resposta.json()).toMatchObject({
    error: expect.stringContaining("chamadas salvas"),
  });
  expect((await banco.query("select id from horarios where id = $1", [aulaDe(0)])).rowCount).toBe(
    1,
  );
});

it("recusa aula com faltas registradas", async () => {
  await desativarExceto([aulaDe(1)]);
  expect((await salvar(dia, [{ alunoId, horarios: [aulaDe(1)] }])).status).toBe(200);
  const resposta = await chamar(`/api/horarios/${aulaDe(1)}`, "DELETE", undefined, cookieAdmin);
  expect(resposta.status).toBe(409);
  expect(await resposta.json()).toMatchObject({ error: expect.stringContaining("faltas") });
  expect((await banco.query("select id from horarios where id = $1", [aulaDe(1)])).rowCount).toBe(
    1,
  );
});

it("não deixa excluir e salvar a mesma aula vencerem ao mesmo tempo", async () => {
  await desativarExceto([aulaDe(3)]);
  const [exclusao, salvamento] = await Promise.all([
    chamar(`/api/horarios/${aulaDe(3)}`, "DELETE", undefined, cookieAdmin),
    salvar(outroDia),
  ]);
  expect([200, 400, 404, 409, 503]).toContain(exclusao.status);
  expect([200, 400, 404, 409, 503]).toContain(salvamento.status);
  expect(exclusao.status === 200 && salvamento.status === 200).toBe(false);
  if (salvamento.status === 200) expect(exclusao.status).toBe(409);
  const retrato = await banco.query("select 1 from aulas_chamada where horario_id = $1", [
    aulaDe(3),
  ]);
  const aula = await banco.query("select 1 from horarios where id = $1", [aulaDe(3)]);
  expect(retrato.rowCount === 0 || aula.rowCount === 1).toBe(true);
});
