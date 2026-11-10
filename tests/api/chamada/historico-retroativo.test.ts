// Contrato da chamada retroativa: composição comprovada, 409 com código,
// confirmação com motivo, auditoria na mesma transação e repetição idempotente.
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import pg from "pg";
import type { Frequencia } from "@/domain/frequencia";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Histórico Retroativo";
const dia = "2026-06-15";
let cookie = "";
let serieId = "";
let turmaCompativel = "";
let turmaIncerta = "";
let turmaOrigem = "";
let turmaDestino = "";
let alunoCompativel = "";
let alunoIncerto = "";
let alunoTransferido = "";

async function chamar(caminho: string, metodo = "GET", corpo?: unknown, sessao = cookie) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: sessao, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function criarTurma(nome: string, criadoEm: string): Promise<string> {
  const { rows } = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome, criado_em) values ($1, $2, $3) returning id",
    [serieId, nome, new Date(`${criadoEm}T12:00:00Z`)],
  );
  const id = rows[0]?.id ?? "";
  await banco.query(
    "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2)",
    [id, [1, 2, 3, 4, 5]],
  );
  return id;
}

async function criarAluno(
  nome: string,
  turmaId: string,
  turmaOriginalId: string,
  criadoEm: string,
): Promise<string> {
  const { rows } = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem, criado_em) values ($1, $2, $3, 1, $4) returning id",
    [nome, turmaId, turmaOriginalId, new Date(`${criadoEm}T12:00:00Z`)],
  );
  return rows[0]?.id ?? "";
}

async function limpar() {
  const turmas = [turmaCompativel, turmaIncerta, turmaOrigem, turmaDestino].filter(Boolean);
  if (turmas.length > 0) {
    await banco.query("delete from frequencias where turma_id = any($1::uuid[])", [turmas]);
  }
  await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  if (turmas.length > 0) {
    await banco.query("delete from horarios where turma_id = any($1::uuid[])", [turmas]);
    await banco.query("delete from turmas where id = any($1::uuid[])", [turmas]);
  }
  if (serieId) await banco.query("delete from series where id = $1", [serieId]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  const entrada = await chamar(
    "/api/auth/entrar",
    "POST",
    {
      email: process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
      senha: process.env.TESTE_SENHA ?? "DemoFrequencia2026",
    },
    "",
  );
  expect(entrada.status).toBe(200);
  cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 98) returning id",
    [prefixo],
  );
  serieId = serie.rows[0]?.id ?? "";
  turmaCompativel = await criarTurma("A", "2026-01-05");
  turmaIncerta = await criarTurma("B", "2026-01-05");
  turmaOrigem = await criarTurma("C", "2026-01-05");
  turmaDestino = await criarTurma("D", "2026-01-05");
  alunoCompativel = await criarAluno(
    `${prefixo} Compatível`,
    turmaCompativel,
    turmaCompativel,
    "2026-02-01",
  );
  alunoIncerto = await criarAluno(`${prefixo} Incerto`, turmaIncerta, turmaIncerta, "2026-11-01");
  alunoTransferido = await criarAluno(
    `${prefixo} Transferido`,
    turmaDestino,
    turmaOrigem,
    "2026-02-01",
  );
});

beforeEach(async () => {
  const turmas = [turmaCompativel, turmaIncerta, turmaOrigem, turmaDestino];
  await banco.query("delete from frequencias where turma_id = any($1::uuid[])", [turmas]);
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

it("permite a data passada quando a composição atual comprova a data, sem confirmação", async () => {
  const resposta = await chamar("/api/frequencias", "POST", {
    dia,
    turmaId: turmaCompativel,
    faltas: [],
    revisao: 0,
  });
  expect(resposta.status).toBe(200);
  const frequencia = ((await resposta.json()) as { frequencia: Frequencia }).frequencia;
  expect(frequencia.alunos).toContain(alunoCompativel);
  const auditoria = await banco.query(
    "select id from confirmacoes_historicas where turma_id = $1 and dia = $2",
    [turmaCompativel, dia],
  );
  expect(auditoria.rowCount).toBe(0);
});

it("recusa com 409 quando o cadastro do aluno é posterior à data", async () => {
  const resposta = await chamar("/api/frequencias", "POST", {
    dia,
    turmaId: turmaIncerta,
    faltas: [],
    revisao: 0,
  });
  expect(resposta.status).toBe(409);
  expect(await resposta.json()).toMatchObject({
    codigo: "CONFIRMACAO_HISTORICA_NECESSARIA",
  });
  const gravadas = await banco.query(
    "select id from frequencias where turma_id = $1 and dia = $2",
    [turmaIncerta, dia],
  );
  expect(gravadas.rowCount).toBe(0);
});

it("confirma com motivo, grava a auditoria e não repete na tentativa seguinte", async () => {
  const corpo = {
    dia,
    turmaId: turmaIncerta,
    faltas: [],
    revisao: 0,
    confirmarHistorico: true,
    motivo: "Chamada lançada no diário de papel",
  };
  const resposta = await chamar("/api/frequencias", "POST", corpo);
  expect(resposta.status).toBe(200);
  const frequencia = ((await resposta.json()) as { frequencia: Frequencia }).frequencia;
  const auditoria = await banco.query<{
    tipo: string;
    dia: Date;
    turma_id: string;
    autor_nome: string;
    motivo: string;
    alunos_snapshot: string[];
  }>(
    "select tipo, dia, turma_id, autor_nome, motivo, alunos_snapshot from confirmacoes_historicas where turma_id = $1 and dia = $2",
    [turmaIncerta, dia],
  );
  expect(auditoria.rowCount).toBe(1);
  expect(auditoria.rows[0]).toMatchObject({
    tipo: "CHAMADA_RETROATIVA",
    turma_id: turmaIncerta,
    autor_nome: expect.any(String),
    motivo: "Chamada lançada no diário de papel",
  });
  expect(auditoria.rows[0]?.alunos_snapshot).toEqual([alunoIncerto]);
  const repetida = await chamar("/api/frequencias", "POST", corpo);
  expect(repetida.status).toBe(409);
  const confirmacoes = await banco.query(
    "select id from confirmacoes_historicas where turma_id = $1 and dia = $2",
    [turmaIncerta, dia],
  );
  expect(confirmacoes.rowCount).toBe(1);
  expect(frequencia.alunos).toContain(alunoIncerto);
});

it("recusa confirmação sem motivo e motivo sem confirmação", async () => {
  for (const corpo of [
    { dia, turmaId: turmaIncerta, faltas: [], revisao: 0, confirmarHistorico: true },
    { dia, turmaId: turmaIncerta, faltas: [], revisao: 0, confirmarHistorico: true, motivo: "   " },
    { dia, turmaId: turmaIncerta, faltas: [], revisao: 0, motivo: "Chamada do diário" },
  ]) {
    const resposta = await chamar("/api/frequencias", "POST", corpo);
    expect(resposta.status).toBe(400);
  }
  const gravadas = await banco.query(
    "select id from frequencias where turma_id = $1 and dia = $2",
    [turmaIncerta, dia],
  );
  expect(gravadas.rowCount).toBe(0);
});

it("exige confirmação quando o aluno está em outro vínculo sem desistência na data", async () => {
  const resposta = await chamar("/api/frequencias", "POST", {
    dia,
    turmaId: turmaOrigem,
    faltas: [],
    revisao: 0,
  });
  expect(resposta.status).toBe(409);
  expect(await resposta.json()).toMatchObject({
    codigo: "CONFIRMACAO_HISTORICA_NECESSARIA",
  });
  expect(alunoTransferido).toEqual(expect.any(String));
});
