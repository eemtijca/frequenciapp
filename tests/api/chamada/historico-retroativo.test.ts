// Contrato da chamada retroativa: composição comprovada, 409 com código,
// consulta sem escrita, motivo opcional, auditoria e proteção contra duplicatas.
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

function consultarHistorico(turmaId: string, data = dia) {
  return chamar(`/api/frequencias?dia=${data}&turmaId=${turmaId}&verificarHistorico=true`);
}

it("consulta só a decisão autorizada sem criar frequência, auditoria ou intenção de envio", async () => {
  const caminho = `/api/frequencias?dia=${dia}&turmaId=${turmaIncerta}&verificarHistorico=true`;
  expect((await chamar(caminho, "GET", undefined, "")).status).toBe(401);
  for (const [turmaId, requerConfirmacaoHistorica] of [
    [turmaIncerta, true],
    [turmaCompativel, false],
  ] as const) {
    const resposta = await consultarHistorico(turmaId);
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ requerConfirmacaoHistorica });
  }
  const { rows } = await banco.query(
    `select
       (select count(*)::int from frequencias where turma_id = $1 and dia = $2) as frequencias,
       (select count(*)::int from confirmacoes_historicas where turma_id = $1 and dia = $2) as auditorias,
       (select count(*)::int from intencoes_envio_escolar where turma_id = $1 and dia = $2) as intencoes`,
    [turmaIncerta, dia],
  );
  expect(rows).toEqual([{ frequencias: 0, auditorias: 0, intencoes: 0 }]);
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

it.each([
  ["com motivo", "  Chamada lançada no diário de papel ", "Chamada lançada no diário de papel"],
  ["sem motivo", undefined, ""],
  ["com espaços", "   ", ""],
])(
  "confirma %s, grava a auditoria e não repete na tentativa seguinte",
  async (_nome, motivo, gravado) => {
    const corpo = {
      dia,
      turmaId: turmaIncerta,
      faltas: [],
      revisao: 0,
      confirmarHistorico: true,
      ...(motivo === undefined ? {} : { motivo }),
    };
    const resposta = await chamar("/api/frequencias", "POST", corpo);
    expect(resposta.status).toBe(200);
    const frequencia = ((await resposta.json()) as { frequencia: Frequencia }).frequencia;
    const auditoria = await banco.query<{
      tipo: string;
      dia: string;
      turma_id: string;
      autor_id: string;
      autor_da_chamada: string;
      autor_nome: string;
      motivo: string;
      alunos_snapshot: string[];
    }>(
      `select c.tipo, to_char(c.dia, 'YYYY-MM-DD') as dia, c.turma_id, c.autor_id,
            f.criado_por_id as autor_da_chamada, c.autor_nome, c.motivo, c.alunos_snapshot
       from confirmacoes_historicas c join frequencias f on f.id = c.frequencia_id
      where c.turma_id = $1 and c.dia = $2`,
      [turmaIncerta, dia],
    );
    expect(auditoria.rowCount).toBe(1);
    expect(auditoria.rows[0]).toMatchObject({
      tipo: "CHAMADA_RETROATIVA",
      turma_id: turmaIncerta,
      dia,
      autor_id: expect.any(String),
      autor_nome: expect.stringMatching(/\S/),
      motivo: gravado,
    });
    expect(auditoria.rows[0]?.autor_id).toBe(auditoria.rows[0]?.autor_da_chamada);
    expect(auditoria.rows[0]?.alunos_snapshot).toEqual([alunoIncerto]);
    const consulta = await consultarHistorico(turmaIncerta);
    expect(consulta.status).toBe(200);
    expect(await consulta.json()).toEqual({ requerConfirmacaoHistorica: false });
    const repetida = await chamar("/api/frequencias", "POST", corpo);
    expect(repetida.status).toBe(409);
    const confirmacoes = await banco.query(
      "select id from confirmacoes_historicas where turma_id = $1 and dia = $2",
      [turmaIncerta, dia],
    );
    expect(confirmacoes.rowCount).toBe(1);
    expect(frequencia.alunos).toContain(alunoIncerto);
  },
);

it("recusa a confirmação após entrada de aluno na lista revisada, sem efeitos colaterais", async () => {
  const turmaId = await criarTurma("E", "2026-01-05");
  try {
    const alunoRevisado = await criarAluno(`${prefixo} Revisado`, turmaId, turmaId, "2026-11-01");
    const previa = await consultarHistorico(turmaId);
    expect(previa.status).toBe(200);
    expect(await previa.json()).toEqual({ requerConfirmacaoHistorica: true });
    const novoAluno = await criarAluno(`${prefixo} Novo`, turmaId, turmaId, "2026-05-01");
    const corpo = {
      dia,
      turmaId,
      faltas: [],
      revisao: 0,
      confirmarHistorico: true,
    };
    const recusada = await chamar("/api/frequencias", "POST", {
      ...corpo,
      listaRevisada: [alunoRevisado],
    });
    expect(recusada.status).toBe(409);
    expect(await recusada.json()).toMatchObject({ codigo: "LISTA_HISTORICA_ALTERADA" });
    const { rows } = await banco.query(
      `select
         (select count(*)::int from frequencias where turma_id = $1 and dia = $2) as frequencias,
         (select count(*)::int from confirmacoes_historicas where turma_id = $1 and dia = $2) as auditorias,
         (select count(*)::int from intencoes_envio_escolar where turma_id = $1 and dia = $2) as intencoes,
         (select count(*)::int from fila_planilha where turma_id = $1 and dia = $2) as fila`,
      [turmaId, dia],
    );
    expect(rows).toEqual([{ frequencias: 0, auditorias: 0, intencoes: 0, fila: 0 }]);
    const aceita = await chamar("/api/frequencias", "POST", {
      ...corpo,
      listaRevisada: [novoAluno, alunoRevisado],
    });
    expect(aceita.status).toBe(200);
    const { frequencia } = (await aceita.json()) as { frequencia: Frequencia };
    expect(frequencia.alunos?.sort()).toEqual([novoAluno, alunoRevisado].sort());
  } finally {
    await banco.query("delete from intencoes_envio_escolar where turma_id = $1", [turmaId]);
    await banco.query("delete from fila_planilha where turma_id = $1", [turmaId]);
    await banco.query("delete from frequencias where turma_id = $1", [turmaId]);
    await banco.query("delete from alunos where turma_id = $1", [turmaId]);
    await banco.query("delete from horarios where turma_id = $1", [turmaId]);
    await banco.query("delete from turmas where id = $1", [turmaId]);
  }
});

it("recusa motivo malformado ou enviado sem confirmação", async () => {
  for (const corpo of [
    {
      dia,
      turmaId: turmaIncerta,
      faltas: [],
      revisao: 0,
      confirmarHistorico: true,
      motivo: " ab ",
    },
    {
      dia,
      turmaId: turmaIncerta,
      faltas: [],
      revisao: 0,
      confirmarHistorico: true,
      motivo: "a".repeat(201),
    },
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
