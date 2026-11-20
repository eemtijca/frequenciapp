// Contrato do horário de provas bimestrais: leitura por qualquer sessão, cadastro para várias
// turmas, conflito de horário, datas passadas fora da leitura, remoção e encerramento pela administração.
import { afterAll, beforeAll, expect, it } from "vitest";
import pg from "pg";
import { diaDaSemanaIso, diaLocal, diaSeguinte } from "@/domain/frequencia";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const fuso = process.env.TZ_APP ?? "America/Fortaleza";
let cookieAdmin = "";
let cookieCoordenacao = "";
let serieId = "";
const turmas: string[] = [];

interface Prova {
  id: string;
  turmaId: string;
  dia: string;
  inicio: string;
  fim: string;
  disciplina: string;
}

/** Próximo dia útil a partir de amanhã, fora do domingo. */
function proximoDiaDeAula(): string {
  let dia = diaSeguinte(diaLocal(new Date(), fuso), 1);
  while (diaDaSemanaIso(dia) === 7) dia = diaSeguinte(dia, 1);
  return dia;
}

function domingoSeguinte(): string {
  let dia = diaSeguinte(diaLocal(new Date(), fuso), 1);
  while (diaDaSemanaIso(dia) !== 7) dia = diaSeguinte(dia, 1);
  return dia;
}

const DIA = proximoDiaDeAula();

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

function chamar(caminho: string, metodo: string, cookie: string, corpo?: unknown, origem = url) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: cookie, Origin: origem, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function adicionar(corpo: unknown, cookie = cookieAdmin, origem = url) {
  return chamar("/api/provas-bimestrais", "POST", cookie, corpo, origem);
}

async function ler(cookie = cookieCoordenacao): Promise<Prova[]> {
  const resposta = await fetch(`${url}/api/provas-bimestrais`, { headers: { Cookie: cookie } });
  expect(resposta.status).toBe(200);
  const provas = ((await resposta.json()) as { provas: Prova[] }).provas;
  return provas.filter((prova) => turmas.includes(prova.turmaId));
}

beforeAll(async () => {
  await banco.connect();
  cookieAdmin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  cookieCoordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  serieId =
    (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ('QA Provas', 94) returning id",
      )
    ).rows[0]?.id ?? "";
  for (const nome of ["A", "B"]) {
    turmas.push(
      (
        await banco.query<{ id: string }>(
          "insert into turmas (nome, serie_id) values ($1, $2) returning id",
          [nome, serieId],
        )
      ).rows[0]?.id ?? "",
    );
  }
});

afterAll(async () => {
  await banco.query("delete from provas_bimestrais where turma_id = any($1::uuid[])", [turmas]);
  await banco.query("delete from turmas where serie_id = $1", [serieId]);
  await banco.query("delete from series where id = $1", [serieId]);
  await banco.end();
});

const matematica = { dia: DIA, inicio: "07:00", fim: "09:00", disciplina: "QA Matemática" };

it("recusa sem sessão, para a coordenação e de origem desconhecida", async () => {
  expect((await fetch(`${url}/api/provas-bimestrais`)).status).toBe(401);
  const corpo = { ...matematica, turmaIds: turmas };
  expect((await adicionar(corpo, "")).status).toBe(401);
  expect((await adicionar(corpo, cookieCoordenacao)).status).toBe(403);
  expect((await adicionar(corpo, cookieAdmin, "https://origem-invalida.exemplo")).status).toBe(403);
  expect(await ler()).toEqual([]);
});

it.each([
  ["sem turmas", { ...matematica, turmaIds: [] }, "Escolha ao menos uma turma."],
  ["data passada", { ...matematica, dia: "2020-03-02" }, "A data da prova já passou."],
  ["domingo", { ...matematica, dia: domingoSeguinte() }, "Domingo não tem aula."],
  ["fim antes do início", { ...matematica, fim: "06:00" }, "posterior ao de início"],
  ["sem disciplina", { ...matematica, disciplina: "  " }, "Informe a disciplina"],
])("recusa %s com 400", async (_rotulo, corpo, mensagem) => {
  const resposta = await adicionar({ turmaIds: turmas, ...corpo });
  expect(resposta.status).toBe(400);
  expect(((await resposta.json()) as { error: string }).error).toContain(mensagem);
});

it("recusa campo extra e turma inexistente", async () => {
  expect((await adicionar({ ...matematica, turmaIds: turmas, sala: "3" })).status).toBe(400);
  const resposta = await adicionar({
    ...matematica,
    turmaIds: ["00000000-0000-4000-8000-000000000999"],
  });
  expect(resposta.status).toBe(404);
});

it("cadastra a mesma prova para as turmas escolhidas e a coordenação lê", async () => {
  const resposta = await adicionar({ ...matematica, turmaIds: turmas });
  expect(resposta.status).toBe(201);
  const { provas } = (await resposta.json()) as { provas: Prova[] };
  expect(provas.map((prova) => prova.turmaId).sort()).toEqual([...turmas].sort());
  expect(provas[0]).toMatchObject({
    dia: DIA,
    inicio: "07:00",
    fim: "09:00",
    disciplina: "QA Matemática",
  });
  expect(await ler()).toHaveLength(2);
  const auditoria = await banco.query<{ alvo: string }>(
    "select alvo from auditoria where acao = 'prova-bimestral.adicionar' order by criado_em desc limit 1",
  );
  expect(auditoria.rows[0]?.alvo).toBe(`dia:${DIA}:turmas:2`);
});

it("recusa outra prova na mesma janela da turma e aceita a que começa quando a outra termina", async () => {
  const conflito = await adicionar({
    ...matematica,
    inicio: "08:00",
    fim: "10:00",
    disciplina: "QA História",
    turmaIds: [turmas[1]],
  });
  expect(conflito.status).toBe(409);
  expect(((await conflito.json()) as { error: string }).error).toContain("QA Provas B");
  const seguinte = await adicionar({
    ...matematica,
    inicio: "09:00",
    fim: "10:30",
    disciplina: "QA História",
    turmaIds: [turmas[1]],
  });
  expect(seguinte.status).toBe(201);
  const daTurmaB = (await ler()).filter((prova) => prova.turmaId === turmas[1]);
  expect(daTurmaB.map((prova) => prova.disciplina)).toEqual(["QA Matemática", "QA História"]);
});

it("não lê provas de datas passadas e as apaga no próximo cadastro", async () => {
  await banco.query(
    "insert into provas_bimestrais (turma_id, dia, inicio, fim, disciplina, atualizado_em) values ($1, '2020-03-02', '07:00', '09:00', 'QA Antiga', now())",
    [turmas[0]],
  );
  expect((await ler()).some((prova) => prova.disciplina === "QA Antiga")).toBe(false);
  expect(
    (await adicionar({ ...matematica, inicio: "13:00", fim: "15:00", turmaIds: [turmas[0]] }))
      .status,
  ).toBe(201);
  const antigas = await banco.query(
    "select 1 from provas_bimestrais where turma_id = $1 and disciplina = 'QA Antiga'",
    [turmas[0]],
  );
  expect(antigas.rows).toHaveLength(0);
});

it("remove uma prova pela administração", async () => {
  const [alvo] = (await ler()).filter((prova) => prova.disciplina === "QA História");
  expect(alvo).toBeDefined();
  const caminho = `/api/provas-bimestrais/${alvo?.id}`;
  expect((await chamar(caminho, "DELETE", cookieCoordenacao)).status).toBe(403);
  expect((await chamar(caminho, "DELETE", cookieAdmin)).status).toBe(200);
  expect((await chamar(caminho, "DELETE", cookieAdmin)).status).toBe(404);
  expect((await chamar("/api/provas-bimestrais/inexistente", "DELETE", cookieAdmin)).status).toBe(
    404,
  );
  expect((await ler()).some((prova) => prova.id === alvo?.id)).toBe(false);
});

it("encerra o período de provas com confirmação", async () => {
  const caminho = "/api/provas-bimestrais/encerrar";
  expect((await chamar(caminho, "POST", cookieCoordenacao, { confirmar: true })).status).toBe(403);
  expect((await chamar(caminho, "POST", cookieAdmin, {})).status).toBe(400);
  const antes = (await ler()).length;
  expect(antes).toBeGreaterThan(0);
  const resposta = await chamar(caminho, "POST", cookieAdmin, { confirmar: true });
  expect(resposta.status).toBe(200);
  expect(((await resposta.json()) as { removidas: number }).removidas).toBeGreaterThanOrEqual(
    antes,
  );
  expect(await ler()).toEqual([]);
});

it("excluir a turma remove as provas dela", async () => {
  const temporaria =
    (
      await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ('Temporaria', $1) returning id",
        [serieId],
      )
    ).rows[0]?.id ?? "";
  turmas.push(temporaria);
  expect((await adicionar({ ...matematica, turmaIds: [temporaria] })).status).toBe(201);
  await banco.query("delete from turmas where id = $1", [temporaria]);
  const restantes = await banco.query("select 1 from provas_bimestrais where turma_id = $1", [
    temporaria,
  ]);
  expect(restantes.rows).toHaveLength(0);
});
