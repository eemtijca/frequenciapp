// Contrato do retrato da Grade: leitura consistente, validação, hash,
// ausência de escrita e mudança de retrato depois de uma gravação.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { RetratoGrade } from "@/domain/relatorio-grade";

const URL_APP = process.env.APP_URL ?? "http://localhost:3000";
const SERIE = "QA Retrato Grade";
const JUSTIFICATIVA = "QARG";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const hoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Fortaleza",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const ontem = new Date(`${hoje}T12:00:00Z`);
ontem.setUTCDate(ontem.getUTCDate() - 1);
const DE = ontem.toISOString().slice(0, 10);
const ATE = hoje;
const turmas = { A: "" };
const alunos = { um: "", dois: "" };
const aulas = { primeira: "", segunda: "", terceira: "" };
let frequenciaDia1 = "";
let frequenciaDia2 = "";
let cookieCoordenacao = "";
let cookieAdmin = "";

async function entrar(email: string, senha: string) {
  const resposta = await fetch(`${URL_APP}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: URL_APP, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function consultar(parametros: string, cookie = cookieCoordenacao) {
  return fetch(`${URL_APP}/api/relatorios/grade/retrato?${parametros}`, {
    headers: { Cookie: cookie },
  });
}

async function limpar() {
  await banco.query(
    "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
    [SERIE],
  );
  await banco.query("delete from alunos where nome like $1", [`${SERIE} %`]);
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [SERIE],
  );
  await banco.query("delete from series where nome = $1", [SERIE]);
  await banco.query("delete from justificativas where codigo = $1", [JUSTIFICATIVA]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  cookieCoordenacao = await entrar(
    process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
    process.env.TESTE_SENHA ?? "DemoFrequencia2026",
  );
  cookieAdmin = await entrar(
    process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
    process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  );
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 96) returning id",
    [SERIE],
  );
  const serieId = serie.rows[0]?.id;
  if (!serieId) throw new Error("Série QA não criada");
  const turma = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
    [serieId],
  );
  turmas.A = turma.rows[0]?.id ?? "";
  if (!turmas.A) throw new Error("Turma QA não criada");
  for (const [ordem, inicio, fim] of [
    [1, "07:00", "07:50"],
    [2, "07:50", "08:40"],
    [3, "08:40", "09:30"],
  ] as const) {
    const horario = await banco.query<{ id: string }>(
      `insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo)
       values ($1, $2, $3, $4, '{1,2,3,4,5,6}', true) returning id`,
      [turmas.A, ordem, inicio, fim],
    );
    if (ordem === 1) aulas.primeira = horario.rows[0]?.id ?? "";
    if (ordem === 2) aulas.segunda = horario.rows[0]?.id ?? "";
    if (ordem === 3) aulas.terceira = horario.rows[0]?.id ?? "";
  }
  for (const [chave, ordem] of [
    ["um", 1],
    ["dois", 2],
  ] as const) {
    const aluno = await banco.query<{ id: string }>(
      `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo)
       values ($1, $2, $2, $3, true) returning id`,
      [`${SERIE} ${chave}`, turmas.A, ordem],
    );
    alunos[chave] = aluno.rows[0]?.id ?? "";
  }
  await banco.query(
    "insert into justificativas (codigo, rotulo, ativo) values ($1, 'Doente QA', true)",
    [JUSTIFICATIVA],
  );
  const criarFrequencia = async (dia: string): Promise<string> => {
    const resposta = await banco.query<{ id: string }>(
      `insert into frequencias (turma_id, dia, revisao, atualizado_em)
       values ($1, $2, 1, now()) returning id`,
      [turmas.A, `${dia}T12:00:00Z`],
    );
    const id = resposta.rows[0]?.id;
    if (!id) throw new Error("Frequência QA não criada");
    for (const alunoId of [alunos.um, alunos.dois]) {
      await banco.query("insert into alunos_chamada (frequencia_id, aluno_id) values ($1, $2)", [
        id,
        alunoId,
      ]);
    }
    for (const horarioId of [aulas.primeira, aulas.segunda, aulas.terceira]) {
      await banco.query("insert into aulas_chamada (frequencia_id, horario_id) values ($1, $2)", [
        id,
        horarioId,
      ]);
    }
    return id;
  };
  frequenciaDia1 = await criarFrequencia(DE);
  frequenciaDia2 = await criarFrequencia(ATE);
  for (const horarioId of [aulas.primeira, aulas.segunda, aulas.terceira]) {
    await banco.query(
      `insert into faltas (frequencia_id, aluno_id, horario_id, justificativa)
       values ($1, $2, $3, $4), ($1, $5, $3, null)`,
      [frequenciaDia1, alunos.um, horarioId, JUSTIFICATIVA, alunos.dois],
    );
  }
  await banco.query(
    "insert into faltas (frequencia_id, aluno_id, horario_id) values ($1, $2, $3)",
    [frequenciaDia2, alunos.um, aulas.primeira],
  );
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("GET /api/relatorios/grade/retrato", () => {
  it("exige sessão e valida os parâmetros", async () => {
    expect((await consultar(`turmaOriginalId=${turmas.A}&de=${DE}&ate=${ATE}`, "")).status).toBe(
      401,
    );
    expect((await consultar(`turmaOriginalId=invalida&de=${DE}&ate=${ATE}`)).status).toBe(400);
    expect((await consultar(`turmaOriginalId=${turmas.A}&de=2026-02-30&ate=${ATE}`)).status).toBe(
      400,
    );
    expect((await consultar(`turmaOriginalId=${turmas.A}&de=${ATE}&ate=${DE}`)).status).toBe(400);
    expect((await consultar(`turmaOriginalId=${turmas.A}&de=${DE}&ate=2999-01-31`)).status).toBe(
      400,
    );
    expect(
      (await consultar(`turmaOriginalId=00000000-0000-4000-8000-000000000000&de=${DE}&ate=${ATE}`))
        .status,
    ).toBe(404);
  });

  it("devolve retrato consistente, sem cache e sem escrever auditoria", async () => {
    const antes = await banco.query<{ total: number }>(
      "select count(*)::int as total from auditoria",
    );
    const resposta = await consultar(`turmaOriginalId=${turmas.A}&de=${DE}&ate=${ATE}`);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const dados = (await resposta.json()) as RetratoGrade;
    expect(dados.retrato.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(dados.retrato.em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dados.retrato.emTexto).not.toBe("");
    expect(dados.retrato.fuso).toBe("America/Fortaleza");
    expect(dados.relatorio.turmaOriginal).toBe(`${SERIE} A`);
    expect(dados.relatorio.de).toBe(DE);
    expect(dados.relatorio.ate).toBe(ATE);
    expect(dados.relatorio.totais).toEqual({ alunos: 2, faltas: 1, justificadas: 1, parciais: 1 });
    const um = dados.relatorio.alunos.find((aluno) => aluno.alunoId === alunos.um);
    expect(um).toMatchObject({
      faltas: 0,
      justificadas: 1,
      parciais: 1,
      totalHistorico: 2,
    });
    expect(um?.ocorrencias.some((item) => item.marca === "FJ")).toBe(true);
    expect(um?.ocorrencias.some((item) => item.marca === "S")).toBe(true);
    const dois = dados.relatorio.alunos.find((aluno) => aluno.alunoId === alunos.dois);
    expect(dois).toMatchObject({ faltas: 1, justificadas: 0, parciais: 0 });
    const depois = await banco.query<{ total: number }>(
      "select count(*)::int as total from auditoria",
    );
    expect(depois.rows[0]?.total).toBe(antes.rows[0]?.total);
  });

  it("mantém o mesmo hash sem mudança e muda depois de uma gravação", async () => {
    const parametros = `turmaOriginalId=${turmas.A}&de=${DE}&ate=${ATE}`;
    const primeira = (await (await consultar(parametros)).json()) as RetratoGrade;
    const segunda = (await (await consultar(parametros)).json()) as RetratoGrade;
    expect(segunda.retrato.hash).toBe(primeira.retrato.hash);

    await banco.query(
      "insert into faltas (frequencia_id, aluno_id, horario_id) values ($1, $2, $3)",
      [frequenciaDia2, alunos.dois, aulas.segunda],
    );
    const terceira = (await (await consultar(parametros)).json()) as RetratoGrade;
    expect(terceira.retrato.hash).not.toBe(primeira.retrato.hash);
    const dois = terceira.relatorio.alunos.find((aluno) => aluno.alunoId === alunos.dois);
    expect(dois).toMatchObject({ faltas: 1, parciais: 1 });
    await banco.query("delete from faltas where frequencia_id = $1 and aluno_id = $2", [
      frequenciaDia2,
      alunos.dois,
    ]);
  });

  it("permite coordenação e administração", async () => {
    const parametros = `turmaOriginalId=${turmas.A}&de=${DE}&ate=${ATE}`;
    expect((await consultar(parametros, cookieCoordenacao)).status).toBe(200);
    expect((await consultar(parametros, cookieAdmin)).status).toBe(200);
  });
});
