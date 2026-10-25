// Contrato da ordem do almoço: leitura por qualquer sessão e definição do dia só pela administração.
import { afterAll, beforeAll, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookieAdmin = "";
let cookieCoordenacao = "";
let serieId = "";
const turmas: string[] = [];
let ordemAnterior: {
  dia_semana: number;
  turma_id: string;
  posicao: number;
  inicio: string | null;
}[] = [];

// Sábado (6) é o dia usado no teste; a ordem existente é preservada e restaurada no fim.
const DIA = 6;

interface Dia {
  diaSemana: number;
  itens: { turmaId: string; posicao: number; inicio: string | null }[];
}

async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await fetch(`${url}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

function definir(cookie: string, dia: number | string, corpo: unknown) {
  return fetch(`${url}/api/ordem-almoco/${dia}`, {
    method: "PUT",
    headers: { Cookie: cookie, Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function ler(cookie = cookieCoordenacao): Promise<Dia[]> {
  const resposta = await fetch(`${url}/api/ordem-almoco`, { headers: { Cookie: cookie } });
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { dias: Dia[] }).dias;
}

beforeAll(async () => {
  await banco.connect();
  cookieAdmin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  cookieCoordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  ordemAnterior = (
    await banco.query(
      "select dia_semana, turma_id, posicao, inicio from ordens_almoco where dia_semana = $1",
      [DIA],
    )
  ).rows;
  serieId =
    (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ('QA Almoco', 95) returning id",
      )
    ).rows[0]?.id ?? "";
  for (const nome of ["A", "B", "C"]) {
    turmas.push(
      (
        await banco.query<{ id: string }>(
          "insert into turmas (nome,serie_id) values ($1,$2) returning id",
          [nome, serieId],
        )
      ).rows[0]?.id ?? "",
    );
  }
});

afterAll(async () => {
  await banco.query("delete from ordens_almoco where dia_semana = $1", [DIA]);
  for (const linha of ordemAnterior) {
    await banco.query(
      "insert into ordens_almoco (dia_semana, turma_id, posicao, inicio, atualizado_em) values ($1,$2,$3,$4, now())",
      [linha.dia_semana, linha.turma_id, linha.posicao, linha.inicio],
    );
  }
  await banco.query("delete from turmas where serie_id = $1", [serieId]);
  await banco.query("delete from series where id = $1", [serieId]);
  await banco.end();
});

it("lê os seis dias, de segunda a sábado", async () => {
  const dias = await ler();
  expect(dias.map((dia) => dia.diaSemana)).toEqual([1, 2, 3, 4, 5, 6]);
});

it("a administração define a ordem do dia e a leitura devolve na mesma ordem", async () => {
  const [a, b, c] = turmas;
  const resposta = await definir(cookieAdmin, DIA, {
    itens: [
      { turmaId: c, inicio: "11:50" },
      { turmaId: a, inicio: null },
      { turmaId: b, inicio: "12:20" },
    ],
  });
  expect(resposta.status).toBe(200);
  const sabado = (await ler()).find((dia) => dia.diaSemana === DIA);
  expect(sabado?.itens).toEqual([
    { turmaId: c, posicao: 1, inicio: "11:50" },
    { turmaId: a, posicao: 2, inicio: null },
    { turmaId: b, posicao: 3, inicio: "12:20" },
  ]);

  // Uma nova definição substitui o dia inteiro.
  expect((await definir(cookieAdmin, DIA, { itens: [{ turmaId: b }] })).status).toBe(200);
  expect((await ler()).find((dia) => dia.diaSemana === DIA)?.itens).toEqual([
    { turmaId: b, posicao: 1, inicio: null },
  ]);
});

it("excluir a turma tira ela da ordem e a posição seguinte sobe", async () => {
  const [a, b, c] = turmas;
  await definir(cookieAdmin, DIA, { itens: [{ turmaId: a }, { turmaId: b }, { turmaId: c }] });
  await banco.query("delete from ordens_almoco where turma_id = $1 and dia_semana = $2", [b, DIA]);
  expect((await ler()).find((dia) => dia.diaSemana === DIA)?.itens).toEqual([
    { turmaId: a, posicao: 1, inicio: null },
    { turmaId: c, posicao: 2, inicio: null },
  ]);
});

it("só a administração define a ordem", async () => {
  expect((await definir(cookieCoordenacao, DIA, { itens: [] })).status).toBe(403);
});

it.each([
  ["domingo", 7, { itens: [] }],
  ["dia zero", 0, { itens: [] }],
  ["dia em texto", "segunda", { itens: [] }],
])("recusa dia inválido: %s", async (_motivo, dia, corpo) => {
  expect((await definir(cookieAdmin, dia, corpo)).status).toBe(400);
});

it("recusa lista inválida", async () => {
  const [a, b] = turmas;
  expect((await definir(cookieAdmin, DIA, {})).status).toBe(400);
  expect(
    (await definir(cookieAdmin, DIA, { itens: [{ turmaId: a }, { turmaId: a }] })).status,
  ).toBe(400);
  expect(
    (await definir(cookieAdmin, DIA, { itens: [{ turmaId: a, inicio: "25:00" }] })).status,
  ).toBe(400);
  expect(
    (
      await definir(cookieAdmin, DIA, {
        itens: [
          { turmaId: a, inicio: "12:30" },
          { turmaId: b, inicio: "12:00" },
        ],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await definir(cookieAdmin, DIA, {
        itens: [{ turmaId: "00000000-0000-4000-8000-000000000000" }],
      })
    ).status,
  ).toBe(404);
});

it("lista vazia limpa o dia", async () => {
  await definir(cookieAdmin, DIA, { itens: [{ turmaId: turmas[0] }] });
  expect((await definir(cookieAdmin, DIA, { itens: [] })).status).toBe(200);
  expect((await ler()).find((dia) => dia.diaSemana === DIA)?.itens).toEqual([]);
});

it("exige sessão para ler", async () => {
  expect((await fetch(`${url}/api/ordem-almoco`)).status).toBe(401);
});
