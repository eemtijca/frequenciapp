// Reorganização global da chamada: permissões, numeração e preservação do histórico.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Ordem Alfabética";
let admin = "";
let coordenacao = "";
let turmaA = "";
let turmaB = "";
let originais: { id: string; ordem: number }[] = [];
const ids: Record<string, string> = {};

async function chamar(
  caminho: string,
  metodo = "POST",
  corpo?: unknown,
  cookie = admin,
  origem = url,
) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Origin: origem, Cookie: cookie, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function ler<T>(resposta: Response, status = 200): Promise<T> {
  expect(resposta.status).toBe(status);
  return (await resposta.json()) as T;
}

async function limpar() {
  await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await banco.query(
    "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
    [prefixo],
  );
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await banco.query("delete from series where nome = $1", [prefixo]);
}

async function cadastro() {
  return (
    await banco.query(
      "select to_jsonb(a) - 'ordem' as aluno from alunos a where nome like $1 order by id",
      [`${prefixo}%`],
    )
  ).rows;
}

async function historico() {
  const parametros = [turmaA, turmaB];
  const chamadas = (
    await banco.query(
      "select to_jsonb(f) as registro from frequencias f where turma_id = any($1::uuid[]) order by id",
      [parametros],
    )
  ).rows;
  const faltas = (
    await banco.query(
      "select to_jsonb(f) as registro from faltas f where frequencia_id in (select id from frequencias where turma_id = any($1::uuid[])) order by frequencia_id, aluno_id, horario_id",
      [parametros],
    )
  ).rows;
  const participantes = (
    await banco.query(
      "select to_jsonb(p) as registro from alunos_chamada p where frequencia_id in (select id from frequencias where turma_id = any($1::uuid[])) order by frequencia_id, aluno_id",
      [parametros],
    )
  ).rows;
  return { chamadas, faltas, participantes };
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  originais = (await banco.query<{ id: string; ordem: number }>("select id, ordem from alunos"))
    .rows;
  for (const [email, senha, papel] of [
    ["direcao@escola.exemplo", "DirecaoFrequencia2026", "admin"],
    ["demo@escola.exemplo", "DemoFrequencia2026", "coordenacao"],
  ] as const) {
    const resposta = await chamar("/api/auth/entrar", "POST", { login: email, senha }, "");
    expect(resposta.status).toBe(200);
    const cookie = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (papel === "admin") admin = cookie;
    else coordenacao = cookie;
  }
  const { serie } = await ler<{ serie: { id: string } }>(
    await chamar("/api/series", "POST", { nome: prefixo, ordem: 95 }),
    201,
  );
  for (const nome of ["A", "B"]) {
    const { turma } = await ler<{ turma: { id: string } }>(
      await chamar("/api/turmas", "POST", { nome, serieId: serie.id }),
      201,
    );
    if (nome === "A") turmaA = turma.id;
    else turmaB = turma.id;
  }
  for (const [nome, turmaId] of [
    ["Zoé", turmaA],
    ["Caio", turmaA],
    ["Álvaro", turmaA],
    ["Aaron", turmaA],
    ["Bruno", turmaB],
    ["Ana", turmaA],
  ] as const) {
    const { aluno } = await ler<{ aluno: { id: string } }>(
      await chamar("/api/alunos", "POST", { nome: `${prefixo} ${nome}`, turmaId }),
      201,
    );
    ids[nome] = aluno.id;
  }
  await ler(
    await chamar("/api/frequencias", "POST", {
      turmaId: turmaA,
      dia: "2026-06-23",
      faltas: [ids.Zoé],
      revisao: 0,
    }),
  );
  await ler(await chamar(`/api/alunos/${ids.Ana}`, "PATCH", { turmaId: turmaB }));
  await ler(await chamar(`/api/alunos/${ids.Aaron}`, "PATCH", { ativo: false }));
  await ler(await chamar(`/api/alunos/${ids.Caio}`, "PATCH", { desistente: true }));
});

afterAll(async () => {
  if (originais.length)
    await banco.query(
      "update alunos as a set ordem = r.ordem from jsonb_to_recordset($1::jsonb) as r(id uuid, ordem integer) where a.id = r.id",
      [JSON.stringify(originais)],
    );
  await limpar();
  await banco.end();
});

describe("ordem alfabética de todas as turmas", () => {
  it("exige administração, origem confiável e confirmação explícita", async () => {
    const antes = (await banco.query("select id, ordem from alunos order by id")).rows;
    for (const [corpo, cookie, origem, status] of [
      [{ confirmar: true }, "", url, 401],
      [{ confirmar: true }, coordenacao, url, 403],
      [{ confirmar: true }, admin, "https://origem-invalida.exemplo", 403],
      [{ confirmar: false }, admin, url, 400],
      [{ confirmar: true, turmaId: turmaA }, admin, url, 400],
    ] as const)
      expect((await chamar("/api/turmas/ordenar", "POST", corpo, cookie, origem)).status).toBe(
        status,
      );
    expect((await banco.query("select id, ordem from alunos order by id")).rows).toEqual(antes);
  });

  it("renumera por turma com acentos e preserva os registros e a origem do transferido", async () => {
    const antes = await cadastro();
    const registros = await historico();
    expect(registros.chamadas).toHaveLength(1);
    expect(registros.faltas.length).toBeGreaterThan(0);
    expect(registros.participantes.length).toBeGreaterThan(0);
    const resultado = await ler<{ turmas: number; alunos: number; atualizados: number }>(
      await chamar("/api/turmas/ordenar", "POST", { confirmar: true }),
    );
    expect(resultado.turmas).toBeGreaterThanOrEqual(2);
    expect(resultado.atualizados).toBeGreaterThan(0);
    expect(
      (
        await banco.query("select nome, ordem from alunos where turma_id = $1 order by ordem", [
          turmaA,
        ])
      ).rows,
    ).toEqual([
      { nome: `${prefixo} Álvaro`, ordem: 1 },
      { nome: `${prefixo} Caio`, ordem: 2 },
      { nome: `${prefixo} Zoé`, ordem: 3 },
      { nome: `${prefixo} Aaron`, ordem: 4 },
    ]);
    expect(
      (
        await banco.query("select nome, ordem from alunos where turma_id = $1 order by ordem", [
          turmaB,
        ])
      ).rows,
    ).toEqual([
      { nome: `${prefixo} Ana`, ordem: 1 },
      { nome: `${prefixo} Bruno`, ordem: 2 },
    ]);
    expect(await cadastro()).toEqual(antes);
    expect(await historico()).toEqual(registros);
    const auditadas = await banco.query(
      "select acao from auditoria where acao = 'turma.ordenar_alunos'",
    );
    expect(auditadas.rows.length).toBeGreaterThan(0);
  });

  it("repete a ação sem alterar novamente a numeração", async () => {
    const antes = (await banco.query("select id, ordem from alunos order by id")).rows;
    const resultado = await ler<{ atualizados: number }>(
      await chamar("/api/turmas/ordenar", "POST", { confirmar: true }),
    );
    expect(resultado.atualizados).toBe(0);
    expect((await banco.query("select id, ordem from alunos order by id")).rows).toEqual(antes);
  });
});
