// Horários semanais: permissões, nomes por dia, preservação da aula e do histórico.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { Horario, Turma } from "@/domain/frequencia";

const url = process.env.APP_URL ?? "http://localhost:3000";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Horários Semanais";
let admin = "";
let coordenacao = "";
let turmaId = "";
let proximaOrdem = 2;

async function chamar(
  caminho: string,
  metodo = "GET",
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

async function criar(disciplinas: Record<string, string> = {}) {
  const { horario } = await ler<{ horario: Horario }>(
    await chamar("/api/horarios", "POST", {
      turmaId,
      ordem: proximaOrdem++,
      inicio: "07:00",
      fim: "07:50",
      diasSemana: [1, 2, 3],
      disciplinas,
    }),
    201,
  );
  return horario;
}

async function atualizar(id: string, corpo: unknown) {
  return (await ler<{ horario: Horario }>(await chamar(`/api/horarios/${id}`, "PATCH", corpo)))
    .horario;
}

async function limpar() {
  await cliente.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await cliente.query(
    "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
    [prefixo],
  );
  await cliente.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await cliente.query("delete from series where nome = $1", [prefixo]);
}

beforeAll(async () => {
  await cliente.connect();
  await limpar();
  for (const [login, senha, papel] of [
    ["direcao@escola.exemplo", "DirecaoFrequencia2026", "admin"],
    ["demo@escola.exemplo", "DemoFrequencia2026", "coordenacao"],
  ] as const) {
    const resposta = await chamar("/api/auth/entrar", "POST", { login, senha }, "");
    expect(resposta.status).toBe(200);
    const cookie = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (papel === "admin") admin = cookie;
    else coordenacao = cookie;
  }
  const { serie } = await ler<{ serie: { id: string } }>(
    await chamar("/api/series", "POST", { nome: prefixo, ordem: 97 }),
    201,
  );
  const { turma } = await ler<{ turma: Turma }>(
    await chamar("/api/turmas", "POST", { serieId: serie.id, nome: "A" }),
    201,
  );
  turmaId = turma.id;
  expect(turma.horarios[0]?.disciplinas).toEqual({});
});

afterAll(async () => {
  await limpar();
  await cliente.end();
});

describe("disciplinas nos horários semanais", () => {
  it("permite consultar a grade pela coordenação sem permitir sua edição", async () => {
    const aula = await criar({ "1": "Português", "2": "Matemática" });
    const { turmas } = await ler<{ turmas: Turma[] }>(
      await chamar("/api/turmas", "GET", undefined, coordenacao),
    );
    expect(
      turmas
        .find((turma) => turma.id === turmaId)
        ?.horarios.find((horario) => horario.id === aula.id)?.disciplinas,
    ).toEqual(aula.disciplinas);
    for (const cookie of ["", coordenacao]) {
      const status = cookie ? 403 : 401;
      expect(
        (
          await chamar(
            `/api/horarios/${aula.id}`,
            "PATCH",
            { disciplinas: { "1": "Artes" } },
            cookie,
          )
        ).status,
      ).toBe(status);
      expect(
        (
          await chamar(
            "/api/horarios",
            "POST",
            {
              turmaId,
              ordem: 98,
              inicio: "07:00",
              fim: "07:50",
              diasSemana: [1],
              disciplinas: { "1": "Artes" },
            },
            cookie,
          )
        ).status,
      ).toBe(status);
    }
    expect(
      (
        await chamar(
          `/api/horarios/${aula.id}`,
          "PATCH",
          { disciplinas: { "1": "Artes" } },
          admin,
          "https://origem-invalida.exemplo",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await ler<{ horarios: Horario[] }>(await chamar(`/api/horarios?turmaId=${turmaId}`))
      ).horarios.find((horario) => horario.id === aula.id)?.disciplinas,
    ).toEqual(aula.disciplinas);
  });

  it("grava disciplinas diferentes por dia e normaliza espaços", async () => {
    const aula = await criar({ "1": " Português ", "2": "Matemática", "3": "" });
    expect(aula.disciplinas).toEqual({ "1": "Português", "2": "Matemática" });
    const atual = await atualizar(aula.id, { disciplinas: { "1": "História", "3": "Geografia" } });
    expect(atual.disciplinas).toEqual({ "1": "História", "2": "Matemática", "3": "Geografia" });
    expect(atual.id).toBe(aula.id);
    expect(atual.ordem).toBe(aula.ordem);
    expect(atual.inicio).toBe(aula.inicio);
    expect(atual.fim).toBe(aula.fim);
  });

  it("mantém disciplinas e desativação em alterações sem esses campos", async () => {
    const aula = await criar({ "1": "Português", "2": "Matemática" });
    await atualizar(aula.id, { ativo: false });
    const atual = await atualizar(aula.id, { inicio: "07:10", disciplinas: { "1": "História" } });
    expect(atual.ativo).toBe(false);
    expect(atual.disciplinas).toEqual({ "1": "História", "2": "Matemática" });
    const janela = await atualizar(aula.id, { fim: "07:55" });
    expect(janela.ativo).toBe(false);
    expect(janela.disciplinas).toEqual(atual.disciplinas);
  });

  it("limpa nomes vazios e dias retirados sem perder outros nomes", async () => {
    const aula = await criar({ "1": "Português", "2": "Matemática", "3": "Artes" });
    const limpa = await atualizar(aula.id, { disciplinas: { "1": " " } });
    expect(limpa.disciplinas).toEqual({ "2": "Matemática", "3": "Artes" });
    const reduzida = await atualizar(aula.id, { diasSemana: [1, 3] });
    expect(reduzida.disciplinas).toEqual({ "3": "Artes" });
    expect(reduzida.diasSemana).toEqual([1, 3]);
  });

  it.each([
    null,
    [],
    { "0": "Português" },
    { "8": "Português" },
    { "01": "Português" },
    { segunda: "Português" },
    { professor: "QA Nome" },
    { "1": 12 },
    { "1": "a".repeat(81) },
    { "6": "Artes" },
  ])("rejeita mapa inválido antes de alterar o horário: %j", async (disciplinas) => {
    const aula = await criar({ "1": "Português" });
    expect((await chamar(`/api/horarios/${aula.id}`, "PATCH", { disciplinas })).status).toBe(400);
    const resposta = await chamar("/api/horarios", "POST", {
      turmaId,
      ordem: 98,
      inicio: "07:00",
      fim: "07:50",
      diasSemana: [1, 2, 3],
      disciplinas,
    });
    expect(resposta.status).toBe(400);
    const lista = await ler<{ horarios: Horario[] }>(
      await chamar(`/api/horarios?turmaId=${turmaId}`),
    );
    expect(lista.horarios.find((horario) => horario.id === aula.id)).toEqual(aula);
  });

  it("preserva as faltas históricas ao trocar o nome de uma disciplina", async () => {
    const aula = await criar({ "1": "Português" });
    const { rows: alunos } = await cliente.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, 1) returning id",
      [`${prefixo} Aluno`, turmaId],
    );
    const aluno = alunos[0];
    if (!aluno) throw new Error("Aluno sintético ausente.");
    const { rows: chamadas } = await cliente.query<{ id: string }>(
      "insert into frequencias (turma_id, dia, revisao, atualizado_em) values ($1, '1990-05-07', 1, now()) returning id",
      [turmaId],
    );
    const chamada = chamadas[0];
    if (!chamada) throw new Error("Chamada sintética ausente.");
    await cliente.query("insert into alunos_chamada (frequencia_id, aluno_id) values ($1, $2)", [
      chamada.id,
      aluno.id,
    ]);
    await cliente.query(
      "insert into faltas (frequencia_id, aluno_id, horario_id) values ($1, $2, $3)",
      [chamada.id, aluno.id, aula.id],
    );
    const antes = (
      await cliente.query("select to_jsonb(f) as registro from faltas f where horario_id = $1", [
        aula.id,
      ])
    ).rows;
    await atualizar(aula.id, { disciplinas: { "1": "Literatura" } });
    expect(
      (
        await cliente.query("select to_jsonb(f) as registro from faltas f where horario_id = $1", [
          aula.id,
        ])
      ).rows,
    ).toEqual(antes);
    expect(
      (await cliente.query("select revisao from frequencias where id = $1", [chamada.id])).rows,
    ).toEqual([{ revisao: 1 }]);
    expect((await chamar(`/api/horarios/${aula.id}`, "DELETE")).status).toBe(409);
  });
});
