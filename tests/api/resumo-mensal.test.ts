// Contrato do acumulado por período, preservando a consulta histórica sem início.
import { afterAll, beforeAll, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookie = "";
let serieId = "";
let turmaId = "";
let alunoId = "";

async function consultar(parametros: string) {
  return fetch(`${url}/api/frequencias/resumo?${parametros}`, { headers: { Cookie: cookie } });
}

beforeAll(async () => {
  await banco.connect();
  const entrada = await fetch(`${url}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@escola.exemplo", senha: "DemoFrequencia2026" }),
  });
  expect(entrada.status).toBe(200);
  cookie = entrada.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  serieId =
    (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ('QA Resumo Mensal', 97) returning id",
      )
    ).rows[0]?.id ?? "";
  turmaId =
    (
      await banco.query<{ id: string }>(
        "insert into turmas (nome,serie_id) values ('A',$1) returning id",
        [serieId],
      )
    ).rows[0]?.id ?? "";
  alunoId =
    (
      await banco.query<{ id: string }>(
        "insert into alunos (nome,turma_id,turma_original_id,ordem) values ('QA Resumo Mensal Aluna',$1,$1,1) returning id",
        [turmaId],
      )
    ).rows[0]?.id ?? "";
  await banco.query(
    "insert into horarios (turma_id,ordem,inicio,fim,dias_semana) values ($1,1,'07:00','07:50',array[1,2,3,4,5,6])",
    [turmaId],
  );
  for (const [dia, justificativa] of [
    ["2026-05-20", null],
    ["2026-06-15", "O"],
    ["2026-06-16", null],
  ] as const) {
    const salvo = await fetch(`${url}/api/frequencias`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: url, "Content-Type": "application/json" },
      body: JSON.stringify({
        dia,
        turmaId,
        revisao: 0,
        faltas: [{ alunoId, justificativa, observacao: justificativa ? "QA Motivo mensal" : null }],
      }),
    });
    expect(salvo.status).toBe(200);
  }
});

afterAll(async () => {
  await banco.query("delete from frequencias where turma_id = $1", [turmaId]);
  await banco.query("delete from alunos where id = $1", [alunoId]);
  await banco.query("delete from turmas where id = $1", [turmaId]);
  await banco.query("delete from series where id = $1", [serieId]);
  await banco.end();
});

it("limita F e FJ ao mês solicitado, com as duas datas inclusivas", async () => {
  const resposta = await consultar("de=2026-06-01&ate=2026-06-30");
  expect(resposta.status).toBe(200);
  const dados = (await resposta.json()) as {
    resumo: { porAluno: { alunoId: string; faltas: number; faltasJustificadas: number }[] };
  };
  expect(dados.resumo.porAluno.find((a) => a.alunoId === alunoId)).toMatchObject({
    faltas: 1,
    faltasJustificadas: 1,
  });
  const unico = await consultar("de=2026-06-15&ate=2026-06-15");
  const doDia = (await unico.json()) as typeof dados;
  expect(doDia.resumo.porAluno.find((a) => a.alunoId === alunoId)).toMatchObject({
    faltas: 0,
    faltasJustificadas: 1,
  });
});

it("mantém o acumulado histórico quando de não é informado", async () => {
  const resposta = await consultar("ate=2026-06-30");
  const dados = (await resposta.json()) as {
    resumo: { porAluno: { alunoId: string; faltas: number; faltasJustificadas: number }[] };
  };
  expect(resposta.status).toBe(200);
  expect(dados.resumo.porAluno.find((a) => a.alunoId === alunoId)).toMatchObject({
    faltas: 2,
    faltasJustificadas: 1,
  });
});

it.each(["de=&ate=2026-06-30", "de=2026-02-30&ate=2026-06-30", "de=2026-07-01&ate=2026-06-30"])(
  "recusa intervalo inválido: %s",
  async (parametros) => {
    expect((await consultar(parametros)).status).toBe(400);
  },
);
