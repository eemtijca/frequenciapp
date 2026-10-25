// Contratos do relatório de movimentações, com dados sintéticos e histórico próprio.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { hashearSenha } from "@/infra/auth/hash";
import type { RelatorioMovimentacoes } from "@/domain/relatorio-movimentacoes";

const URL_APP = process.env.APP_URL ?? "http://localhost:3000";
const ROTA = "/api/relatorios/movimentacoes";
const DE = "2025-02-03";
const ATE = "2025-02-09";
const SERIE = "QA Relatório Movimentações";
const EMAIL_DIRETOR = "qa-relatorio-movimentacoes@escola.exemplo";
const SENHA_DIRETOR = "QaRelatorioMovimentacoes2026";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const turmas = { A: "", B: "" };
const alunos = { ana: "", bea: "", inativo: "", transferido: "" };
let cookieCoordenacao = "";
let cookieAdmin = "";
let cookieDiretor = "";

function consultar(parametros: string, cookie = cookieCoordenacao) {
  return fetch(`${URL_APP}${ROTA}?${parametros}`, { headers: { Cookie: cookie } });
}

async function entrar(email: string, senha: string) {
  const resposta = await fetch(`${URL_APP}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: URL_APP, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function relatorio(turmaId?: string, de = DE, ate = ATE) {
  const resposta = await consultar(`de=${de}&ate=${ate}${turmaId ? `&turmaId=${turmaId}` : ""}`);
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get("cache-control")).toBe("no-store");
  return (await resposta.json()) as RelatorioMovimentacoes;
}

async function limpar() {
  await banco.query("delete from alunos where nome like 'QA Relatório Movimentações %'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [SERIE],
  );
  await banco.query("delete from series where nome = $1", [SERIE]);
  await banco.query("delete from justificativas where codigo = 'QARM'");
  await banco.query("delete from liberadores where codigo = 'QARMRESP'");
  await banco.query("delete from usuarios where email = $1", [EMAIL_DIRETOR]);
  await banco.query(
    "delete from tentativas_entrada where chave like '%qa-relatorio-movimentacoes%'",
  );
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
  const diretor = await banco.query<{ id: string }>(
    `insert into usuarios (email, senha_hash, nome, papel, atualizado_em)
     values ($1, $2, 'QA Responsável legado', 'DIRETOR_TURMA', now()) returning id`,
    [EMAIL_DIRETOR, await hashearSenha(SENHA_DIRETOR)],
  );
  const diretorId = diretor.rows[0]?.id;
  await banco.query(
    `insert into credenciais_diretor
       (usuario_id, emitida_em, expira_em, primeiro_uso_em, troca_obrigatoria, atualizado_em)
     values ($1, now(), now() + interval '1 day', now(), false, now())`,
    [diretorId],
  );
  cookieDiretor = await entrar(EMAIL_DIRETOR, SENHA_DIRETOR);
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 97) returning id",
    [SERIE],
  );
  const resultadoTurmas = await banco.query<{ id: string; nome: "A" | "B" }>(
    "insert into turmas (serie_id, nome) values ($1, 'B'), ($1, 'A') returning id, nome",
    [serie.rows[0]?.id],
  );
  for (const turma of resultadoTurmas.rows) turmas[turma.nome] = turma.id;
  for (const chave of ["ana", "bea", "inativo", "transferido"] as const) {
    const aluno = await banco.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, 1) returning id",
      [`${SERIE} ${chave}`, chave === "bea" ? turmas.B : turmas.A],
    );
    alunos[chave] = aluno.rows[0]?.id ?? "";
  }
  await banco.query(
    "insert into justificativas (codigo, rotulo, ativo) values ('QARM', 'Consulta', false)",
  );
  await banco.query(
    "insert into liberadores (codigo, rotulo, ativo) values ('QARMRESP', 'QA Coordenação', false)",
  );

  // Os limites incluem o primeiro e o último dia, inclusive no fim de semana.
  for (const registro of [
    { aluno: alunos.ana, turma: turmas.A, rotulo: `${SERIE} A`, dia: DE, horario: "08:05" },
    {
      aluno: alunos.inativo,
      turma: turmas.A,
      rotulo: `${SERIE} A`,
      dia: "2025-02-05",
      horario: "09:00",
    },
    {
      aluno: alunos.transferido,
      turma: turmas.A,
      rotulo: "QA Turma Histórica",
      dia: "2025-02-05",
      horario: "08:00",
    },
    { aluno: alunos.bea, turma: turmas.B, rotulo: `${SERIE} B`, dia: ATE, horario: "23:59" },
    {
      aluno: alunos.bea,
      turma: turmas.B,
      rotulo: `${SERIE} B`,
      dia: "2025-02-02",
      horario: "23:59",
    },
    {
      aluno: alunos.bea,
      turma: turmas.B,
      rotulo: `${SERIE} B`,
      dia: "2025-02-10",
      horario: "00:00",
    },
  ]) {
    await banco.query(
      `insert into entradas_atrasadas
        (aluno_id, turma_id, turma_rotulo, dia, horario, motivo, registrado_por_nome,
         momento, responsavel_registro_nome)
       values ($1, $2, $3, $4::date, $5, 'Transporte atrasado', 'QA Autoria histórica',
         'aula_2', $6)`,
      [
        registro.aluno,
        registro.turma,
        registro.rotulo,
        registro.dia,
        registro.horario,
        registro.aluno === alunos.bea ? null : "QA Responsável histórico",
      ],
    );
    await banco.query(
      `insert into saidas_antecipadas
         (aluno_id, dia, horario, momento, justificativa, observacao, liberado_por_codigo, liberado_por_id)
       values ($1, $2::date, $3, 'almoco', 'QARM', 'Retorno agendado', $4, $5)`,
      [
        registro.aluno,
        registro.dia,
        registro.aluno === alunos.bea ? null : "12:05",
        registro.aluno === alunos.bea ? null : "QARMRESP",
        registro.aluno === alunos.bea ? diretorId : null,
      ],
    );
  }
  await banco.query("update alunos set ativo = false where id = $1", [alunos.inativo]);
  await banco.query("update alunos set turma_id = $1 where id = $2", [
    turmas.B,
    alunos.transferido,
  ]);
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("relatório de saídas e entradas", () => {
  it("exige sessão da equipe e recusa o diretor de turma", async () => {
    const filtros = `de=${DE}&ate=${ATE}`;
    expect((await consultar(filtros, "")).status).toBe(401);
    expect((await consultar(filtros, cookieDiretor)).status).toBe(403);
    expect((await consultar(filtros, cookieCoordenacao)).status).toBe(200);
    expect((await consultar(filtros, cookieAdmin)).status).toBe(200);
  });

  it("valida datas completas, turma, ordem, limite inclusivo e futuro", async () => {
    for (const filtros of [
      "",
      `de=${DE}`,
      `ate=${ATE}`,
      `de=2025-02&ate=${ATE}`,
      `de=2025-02-30&ate=${ATE}`,
      `de=${DE}&ate=2025-02-30`,
      `de=${ATE}&ate=${DE}`,
      `de=${DE}&ate=${ATE}&turmaId=inválida`,
      "de=2024-01-01&ate=2025-01-01",
      "de=2999-01-01&ate=2999-01-02",
    ]) {
      expect((await consultar(filtros)).status, filtros).toBe(400);
    }
    // Ano bissexto completo: 366 dias, sem truncar silenciosamente o intervalo.
    expect((await consultar(`de=2024-01-01&ate=2024-12-31&turmaId=${turmas.A}`)).status).toBe(200);
  });

  it("inclui os dois limites e organiza turmas e horários sem misturar os tipos", async () => {
    const resultado = await relatorio();
    const proprias = resultado.turmas.filter((turma) =>
      Object.values(turmas).includes(turma.turmaId),
    );
    expect(proprias.map((turma) => turma.turmaRotulo)).toEqual([
      `${SERIE} A`,
      `${SERIE} B`,
      "QA Turma Histórica",
    ]);
    const movimentos = proprias.flatMap((turma) => turma.movimentacoes);
    expect(movimentos).toHaveLength(8);
    expect(movimentos.every((item) => item.dia >= DE && item.dia <= ATE)).toBe(true);
    const grupoA = proprias.find((turma) => turma.turmaRotulo === `${SERIE} A`);
    expect(grupoA).toMatchObject({ saidas: 2, entradas: 2, total: 4 });
    expect(grupoA?.movimentacoes.map((item) => [item.dia, item.tipo, item.horario])).toEqual([
      [DE, "ENTRADA", "08:05"],
      [DE, "SAIDA", "12:05"],
      ["2025-02-05", "ENTRADA", "09:00"],
      ["2025-02-05", "SAIDA", "12:05"],
    ]);
    const grupoB = proprias.find((turma) => turma.turmaId === turmas.B);
    expect(grupoB?.movimentacoes.slice(-2).map((item) => item.horario)).toEqual(["23:59", null]);
    expect(resultado.totais).toEqual({
      saidas: resultado.turmas.reduce((total, turma) => total + turma.saidas, 0),
      entradas: resultado.turmas.reduce((total, turma) => total + turma.entradas, 0),
      total: resultado.turmas.reduce((total, turma) => total + turma.total, 0),
    });
  });

  it("preserva desativados, entrada na turma histórica e saída na turma atual", async () => {
    const resultadoA = await relatorio(turmas.A);
    const movimentosA = resultadoA.turmas.flatMap((turma) => turma.movimentacoes);
    expect(resultadoA.totais).toEqual({ entradas: 3, saidas: 2, total: 5 });
    expect(movimentosA.filter((item) => item.alunoId === alunos.inativo)).toHaveLength(2);
    expect(
      movimentosA.filter((item) => item.alunoId === alunos.transferido).map((item) => item.tipo),
    ).toEqual(["ENTRADA"]);
    expect(
      resultadoA.turmas.find((turma) => turma.turmaRotulo === "QA Turma Histórica")?.turmaId,
    ).toBe(turmas.A);
    const resultadoB = await relatorio(turmas.B);
    expect(resultadoB.totais).toEqual({ entradas: 1, saidas: 2, total: 3 });
    expect(
      resultadoB.turmas
        .flatMap((turma) => turma.movimentacoes)
        .filter((item) => item.alunoId === alunos.transferido)
        .map((item) => item.tipo),
    ).toEqual(["SAIDA"]);
  });

  it("mantém motivos, complementos e responsáveis históricos ou do catálogo desativado", async () => {
    const movimentosA = (await relatorio(turmas.A)).turmas.flatMap((turma) => turma.movimentacoes);
    expect(
      movimentosA.find((item) => item.alunoId === alunos.ana && item.tipo === "SAIDA"),
    ).toMatchObject({
      motivo: "Consulta · Retorno agendado",
      responsavel: "QA Coordenação",
      momento: "almoco",
    });
    expect(
      movimentosA.find((item) => item.alunoId === alunos.ana && item.tipo === "ENTRADA"),
    ).toMatchObject({
      motivo: "Transporte atrasado",
      responsavel: "QA Responsável histórico",
      momento: "aula_2",
    });
    const movimentosB = (await relatorio(turmas.B)).turmas.flatMap((turma) => turma.movimentacoes);
    expect(
      movimentosB.find((item) => item.alunoId === alunos.bea && item.tipo === "SAIDA"),
    ).toMatchObject({
      responsavel: "QA Responsável legado",
      horario: null,
    });
    expect(
      movimentosB.find((item) => item.alunoId === alunos.bea && item.tipo === "ENTRADA")
        ?.responsavel,
    ).toBe("QA Autoria histórica");
  });

  it("consulta um dia e devolve vazio quando não há registros, sem criar chamada", async () => {
    expect((await relatorio(turmas.A, DE, DE)).totais).toEqual({
      entradas: 1,
      saidas: 1,
      total: 2,
    });
    expect(await relatorio(turmas.A, "2025-02-04", "2025-02-04")).toEqual({
      de: "2025-02-04",
      ate: "2025-02-04",
      totais: { entradas: 0, saidas: 0, total: 0 },
      turmas: [],
    });
    const chamadas = await banco.query<{ total: number }>(
      "select count(*)::int as total from frequencias where turma_id = any($1::uuid[])",
      [Object.values(turmas)],
    );
    expect(chamadas.rows[0]?.total).toBe(0);
  });
});
