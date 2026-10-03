// Confirmação manual da Seduc na chamada normal, com concorrência,
// preservação das demais confirmações e restauração da cópia JSON.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import pg from "pg";
import type { Frequencia, ConfirmacaoSeducAluno } from "@/domain/frequencia";
import type { CopiaFrequenciapp } from "@/application/backup";

const url = process.env.APP_URL ?? "http://localhost:3000";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Seduc Chamada";
const dia = "2026-06-15";
let cookie = "";
let admin = "";
let serieId = "";
let turmaId = "";
let alunoId = "";
let segundoId = "";
let horarios: string[] = [];

async function chamar(caminho: string, corpo?: unknown, sessao = cookie, origem = url) {
  return fetch(`${url}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { Cookie: sessao, Origin: origem, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}
async function carregar(): Promise<Frequencia> {
  const resposta = await chamar(`/api/frequencias?dia=${dia}&turmaId=${turmaId}`);
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { frequencia: Frequencia }).frequencia;
}
async function salvar(faltas: unknown[] = [], revisao = 0): Promise<Frequencia> {
  const resposta = await chamar("/api/frequencias", { dia, turmaId, faltas, revisao });
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { frequencia: Frequencia }).frequencia;
}
function corpoConfirmacao(frequencia: Frequencia, id = alunoId, registrado = true) {
  return {
    dia,
    turmaId,
    alunoId: id,
    registrado,
    revisao: frequencia.revisao,
    revisaoSeduc:
      frequencia.confirmacoesSeduc?.find((item) => item.alunoId === id)?.revisaoSeduc ?? 0,
  };
}
async function confirmar(frequencia: Frequencia, id = alunoId, registrado = true, sessao = cookie) {
  const resposta = await chamar(
    "/api/frequencias/seduc",
    corpoConfirmacao(frequencia, id, registrado),
    sessao,
  );
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { confirmacao: ConfirmacaoSeducAluno }).confirmacao;
}
async function limpar() {
  await cliente.query(
    "delete from auditoria where alvo like 'chamada:%:aluno:%' and substring(alvo from ':aluno:(.*)$') in (select id::text from alunos where nome like $1)",
    [`${prefixo}%`],
  );
  await cliente.query(
    "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
    [prefixo],
  );
  await cliente.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await cliente.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await cliente.query("delete from series where nome = $1", [prefixo]);
}
beforeAll(async () => {
  await cliente.connect();
  await limpar();
  for (const papel of ["coordenacao", "admin"]) {
    const resposta = await chamar(
      "/api/auth/entrar",
      {
        email:
          papel === "admin"
            ? (process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo")
            : (process.env.TESTE_EMAIL ?? "demo@escola.exemplo"),
        senha:
          papel === "admin"
            ? (process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026")
            : (process.env.TESTE_SENHA ?? "DemoFrequencia2026"),
      },
      "",
    );
    expect(resposta.status).toBe(200);
    const sessao = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (papel === "admin") admin = sessao;
    else cookie = sessao;
  }
  serieId =
    (
      await cliente.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, 98) returning id",
        [prefixo],
      )
    ).rows[0]?.id ?? "";
  turmaId =
    (
      await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
        [serieId],
      )
    ).rows[0]?.id ?? "";
  const alunos = await cliente.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $3, $3, 1), ($2, $3, $3, 2) returning id",
    [`${prefixo} Um`, `${prefixo} Dois`, turmaId],
  );
  alunoId = alunos.rows[0]?.id ?? "";
  segundoId = alunos.rows[1]?.id ?? "";
  horarios = (
    await cliente.query<{ id: string }>(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2), ($1, 2, '07:50', '08:40', $2) returning id",
      [turmaId, [1, 2, 3, 4, 5, 6, 7]],
    )
  ).rows.map((item) => item.id);
});
beforeEach(async () => {
  await cliente.query(
    "delete from auditoria where alvo in (select 'chamada:' || frequencia_id::text || ':aluno:' || aluno_id::text from alunos_chamada where aluno_id = any($1::uuid[]))",
    [[alunoId, segundoId]],
  );
  await cliente.query("delete from frequencias where turma_id = $1", [turmaId]);
});
afterAll(async () => {
  await limpar();
  await cliente.end();
});

it("guarda data e responsável, mantém presença e revisão, permite desmarcar e audita", async () => {
  const inicial = await salvar();
  const confirmada = await confirmar(inicial);
  expect(confirmada).toMatchObject({ alunoId, registradoSeduc: true, revisaoSeduc: 1 });
  expect(confirmada.registradoSeducEm).toEqual(expect.any(String));
  expect(confirmada.registradoSeducPorNome).toEqual(expect.any(String));
  const atual = await carregar();
  expect(atual.revisao).toBe(inicial.revisao);
  expect(atual.atualizadoEm).toBe(inicial.atualizadoEm);
  expect(atual.faltas).toEqual(inicial.faltas);
  expect(await confirmar(atual, alunoId, true, admin)).toEqual(confirmada);
  expect(await confirmar(atual, alunoId, false)).toMatchObject({
    registradoSeduc: false,
    registradoSeducEm: null,
    registradoSeducPorNome: null,
    revisaoSeduc: 2,
  });
  const auditoria = await cliente.query<{ acao: string }>(
    "select acao from auditoria where alvo like $1",
    [`chamada:%:aluno:${alunoId}`],
  );
  expect(auditoria.rows.map((item) => item.acao).sort()).toEqual([
    "chamada.confirmarSeduc",
    "chamada.reabrirSeduc",
  ]);
});

it("preserva confirmações ao salvar sem mudanças e invalida somente o aluno corrigido", async () => {
  const inicial = await salvar([alunoId]);
  await confirmar(inicial);
  const segunda = await confirmar(inicial, segundoId);
  const igual = await salvar([{ alunoId, horarios: [...horarios].reverse() }], inicial.revisao);
  expect(igual.confirmacoesSeduc?.every((item) => item.registradoSeduc)).toBe(true);
  const corrigida = await salvar([], igual.revisao);
  expect(corrigida.confirmacoesSeduc?.find((item) => item.alunoId === alunoId)).toMatchObject({
    registradoSeduc: false,
    registradoSeducEm: null,
    registradoSeducPorNome: null,
  });
  expect(corrigida.confirmacoesSeduc?.find((item) => item.alunoId === segundoId)).toEqual(segunda);
  expect((await chamar("/api/frequencias/seduc", corpoConfirmacao(igual))).status).toBe(409);
});

it("uma mudança de aulas ou justificativa exige reconfirmar", async () => {
  const inicial = await salvar([alunoId]);
  await confirmar(inicial);
  const parcial = await salvar([{ alunoId, horarios: [horarios[0]] }], inicial.revisao);
  expect(parcial.confirmacoesSeduc?.find((item) => item.alunoId === alunoId)?.registradoSeduc).toBe(
    false,
  );
  await confirmar(parcial);
  const codigo = (
    await cliente.query<{ codigo: string }>(
      "select codigo from justificativas order by codigo limit 1",
    )
  ).rows[0]?.codigo;
  expect(codigo).toEqual(expect.any(String));
  const justificada = await salvar(
    [{ alunoId, horarios: [horarios[0]], justificativa: codigo }],
    parcial.revisao,
  );
  expect(
    justificada.confirmacoesSeduc?.find((item) => item.alunoId === alunoId)?.registradoSeduc,
  ).toBe(false);
});

it("recusa confirmação antiga após desmarcação e resolve duas confirmações concorrentes", async () => {
  const inicial = await salvar();
  const corpo = corpoConfirmacao(inicial);
  const concorrentes = await Promise.all([
    chamar("/api/frequencias/seduc", corpo),
    chamar("/api/frequencias/seduc", corpo, admin),
  ]);
  expect(concorrentes.map((item) => item.status).sort()).toEqual([200, 409]);
  const atual = await carregar();
  await confirmar(atual, alunoId, false);
  expect((await chamar("/api/frequencias/seduc", corpo)).status).toBe(409);
});

it("exige sessão, origem válida, chamada salva e aluno da lista", async () => {
  const corpo = { dia, turmaId, alunoId, registrado: true, revisao: 1, revisaoSeduc: 0 };
  expect((await chamar("/api/frequencias/seduc", corpo, "")).status).toBe(401);
  expect(
    (await chamar("/api/frequencias/seduc", corpo, cookie, "https://outro.exemplo")).status,
  ).toBe(403);
  expect((await chamar("/api/frequencias/seduc", corpo)).status).toBe(409);
  const inicial = await salvar();
  expect(
    (
      await chamar("/api/frequencias/seduc", {
        ...corpoConfirmacao(inicial),
        alunoId: randomUUID(),
      })
    ).status,
  ).toBe(400);
  expect(
    (await chamar("/api/frequencias/seduc", { ...corpoConfirmacao(inicial), registrado: "sim" }))
      .status,
  ).toBe(400);
  expect((await carregar()).confirmacoesSeduc?.some((item) => item.registradoSeduc)).toBe(false);
});

async function copiaDaTurma(): Promise<CopiaFrequenciapp> {
  const resposta = await chamar(
    "/api/backup/exportar",
    { senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026" },
    admin,
  );
  expect(resposta.status).toBe(200);
  const copia = (await resposta.json()) as CopiaFrequenciapp;
  return {
    formato: copia.formato,
    versao: copia.versao,
    series: copia.series.filter((item) => item.id === serieId),
    turmas: copia.turmas.filter((item) => item.id === turmaId),
    alunos: copia.alunos.filter((item) => item.turmaId === turmaId),
    horarios: copia.horarios.filter((item) => item.turmaId === turmaId),
    frequencias: copia.frequencias.filter((item) => item.turmaId === turmaId),
    saidas: [],
    justificativas: copia.justificativas,
  };
}
it("exporta e restaura a confirmação sem sobrescrever uma confirmação divergente", async () => {
  const inicial = await salvar();
  const confirmada = await confirmar(inicial);
  const copia = await copiaDaTurma();
  expect(
    copia.frequencias[0]?.confirmacoesSeduc?.find((item) => item.alunoId === alunoId),
  ).toMatchObject(confirmada);
  await cliente.query("delete from frequencias where turma_id = $1", [turmaId]);
  const restauracao = await chamar("/api/backup", copia, admin);
  expect(restauracao.status).toBe(200);
  expect((await carregar()).confirmacoesSeduc?.find((item) => item.alunoId === alunoId)).toEqual(
    confirmada,
  );
  const atual = await carregar();
  await confirmar(atual, alunoId, false);
  const repetida = await chamar("/api/backup", copia, admin);
  expect(repetida.status).toBe(200);
  expect((await repetida.json()) as { conflitos: number }).toMatchObject({ conflitos: 1 });
  expect(
    (await carregar()).confirmacoesSeduc?.find((item) => item.alunoId === alunoId)?.registradoSeduc,
  ).toBe(false);
});

it("aceita cópia antiga sem confirmações e recusa dados incoerentes ou duplicados", async () => {
  const inicial = await salvar();
  await confirmar(inicial);
  const copia = await copiaDaTurma();
  const frequencia = copia.frequencias[0];
  const confirmada = frequencia?.confirmacoesSeduc?.find((item) => item.alunoId === alunoId);
  expect(confirmada).toBeDefined();
  if (!frequencia || !confirmada) throw new Error("Cópia sintética incompleta.");
  const incoerente = structuredClone(copia);
  const item = incoerente.frequencias[0]?.confirmacoesSeduc?.find((c) => c.alunoId === alunoId);
  if (item) item.registradoSeducEm = null;
  expect((await chamar("/api/backup", incoerente, admin)).status).toBe(400);
  frequencia.confirmacoesSeduc?.push(confirmada);
  expect((await chamar("/api/backup", copia, admin)).status).toBe(400);
  delete frequencia.confirmacoesSeduc;
  await cliente.query("delete from frequencias where turma_id = $1", [turmaId]);
  expect((await chamar("/api/backup", copia, admin)).status).toBe(200);
  expect((await carregar()).confirmacoesSeduc?.every((c) => !c.registradoSeduc)).toBe(true);
});
