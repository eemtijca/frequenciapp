// Contratos da lista combinada: histórico diário, ajustes independentes e confirmação por fonte.
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import pg from "pg";
import type { RegistroPersonalizado } from "@/domain/frequencia-personalizada";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";

const url = process.env.APP_URL ?? "http://localhost:3000";
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Chamada Personalizada";
const dia = "2026-06-15";
const alunos: string[] = [];
const horarios: string[] = [];
const parciaisCriadas = new Set<string>();
let cookie = "";
let turmaId = "";
let outraTurmaId = "";
let codigoJustificativa = "";

async function chamar(caminho: string, metodo = "GET", corpo?: unknown, sessao = cookie) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: sessao, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function alunoDe(indice: number): string {
  const id = alunos[indice];
  if (!id) throw new Error("Aluno sintético não preparado.");
  return id;
}

async function listar(filtros = `dia=${dia}&turmaId=${turmaId}`) {
  const resposta = await chamar(`/api/frequencias-personalizadas?${filtros}`);
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { registros: RegistroPersonalizado[] }).registros;
}

async function salvarPersonalizacao(alunoId = alunoDe(0), turma = turmaId) {
  const resposta = await chamar("/api/frequencias-parciais", "POST", {
    alunoId,
    turmaId: turma,
    dia,
    tipo: "TURNO",
    turno: "TARDE",
    revisao: 0,
  });
  expect(resposta.status).toBe(200);
  const registro = ((await resposta.json()) as { registro: FrequenciaParcial }).registro;
  parciaisCriadas.add(registro.id);
  return registro;
}

async function salvarBase(turma = turmaId, ids = alunos.slice(0, 4), data = dia) {
  const criada = await cliente.query<{ id: string }>(
    "insert into frequencias (turma_id, dia, revisao, atualizado_em) values ($1, $2, 3, now()) returning id",
    [turma, data],
  );
  const id = criada.rows[0]?.id;
  if (!id) throw new Error("Chamada sintética não preparada.");
  for (const alunoId of ids)
    await cliente.query("insert into alunos_chamada (frequencia_id, aluno_id) values ($1, $2)", [
      id,
      alunoId,
    ]);
  return id;
}

async function limparRegistros() {
  await cliente.query(
    "delete from auditoria where alvo = any($1::text[]) or alvo in (select 'parcial:' || id::text from frequencias_parciais where aluno_id = any($2::uuid[])) or alvo in (select 'chamada:' || frequencia_id::text || ':aluno:' || aluno_id::text from alunos_chamada where aluno_id = any($2::uuid[]))",
    [[...parciaisCriadas].map((id) => `parcial:${id}`), alunos],
  );
  await cliente.query("delete from frequencias_parciais where aluno_id = any($1::uuid[])", [
    alunos,
  ]);
  await cliente.query(
    "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
    [prefixo],
  );
  await cliente.query("delete from saidas_antecipadas where aluno_id = any($1::uuid[])", [alunos]);
}

async function limpar() {
  await limparRegistros();
  await cliente.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await cliente.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await cliente.query("delete from series where nome = $1", [prefixo]);
}

beforeAll(async () => {
  await cliente.connect();
  const antigos = await cliente.query<{ id: string }>("select id from alunos where nome like $1", [
    `${prefixo}%`,
  ]);
  alunos.push(...antigos.rows.map((item) => item.id));
  await limpar();
  alunos.length = 0;
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
  const serie = await cliente.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 98) returning id",
    [prefixo],
  );
  const turmas = await cliente.query<{ id: string; nome: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A'), ($1, 'B') returning id, nome",
    [serie.rows[0]?.id],
  );
  turmaId = turmas.rows.find((item) => item.nome === "A")?.id ?? "";
  outraTurmaId = turmas.rows.find((item) => item.nome === "B")?.id ?? "";
  for (let indice = 0; indice < 5; indice++) {
    const criada = await cliente.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3) returning id",
      [`${prefixo} ${indice + 1}`, turmaId, indice + 1],
    );
    const id = criada.rows[0]?.id;
    if (!id) throw new Error("Aluno sintético não preparado.");
    alunos.push(id);
  }
  for (let ordem = 1; ordem <= 3; ordem++) {
    const criado = await cliente.query<{ id: string }>(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, $2, '07:00', '07:50', $3) returning id",
      [turmaId, ordem, [1, 2, 3, 4, 5, 6, 7]],
    );
    const id = criado.rows[0]?.id;
    if (!id) throw new Error("Horário sintético não preparado.");
    horarios.push(id);
  }
  codigoJustificativa =
    (
      await cliente.query<{ codigo: string }>(
        "select codigo from justificativas order by codigo limit 1",
      )
    ).rows[0]?.codigo ?? "";
  expect(codigoJustificativa).not.toBe("");
});

beforeEach(async () => {
  await limparRegistros();
  await cliente.query("update alunos set turma_id = $1, ativo = true where id = any($2::uuid[])", [
    turmaId,
    alunos,
  ]);
  await cliente.query("update horarios set ativo = true where id = any($1::uuid[])", [horarios]);
});

afterAll(async () => {
  await limpar();
  await cliente.end();
});

it("exige sessão e valida datas, período e turma", async () => {
  expect((await chamar("/api/frequencias-personalizadas", "GET", undefined, "")).status).toBe(401);
  for (const filtro of [
    "dia=2026-02-30",
    "turmaId=inválida",
    "de=2026-06-01",
    "de=2026-06-02&ate=2026-06-01",
    "de=2026-01-01&ate=2026-06-01",
    `dia=${dia}&de=2026-06-01&ate=2026-06-30`,
  ])
    expect((await chamar(`/api/frequencias-personalizadas?${filtro}`)).status).toBe(400);
});

it("não supõe presença sem chamada salva nem inclui alunos fora da lista histórica", async () => {
  expect(await listar()).toEqual([]);
  await salvarBase();
  await cliente.query("update alunos set ativo = false where id = $1", [alunoDe(0)]);
  const registros = await listar();
  expect(registros).toHaveLength(4);
  expect(registros.map((item) => item.alunoId).sort()).toEqual(alunos.slice(0, 4).sort());
  expect(registros.every((item) => item.tipo === "CHAMADA" && item.marca === "P")).toBe(true);
  expect(registros[0]).toMatchObject({
    id: `chamada:${alunoDe(0)}:${dia}`,
    descricao: "Dia inteiro",
    revisao: 3,
    revisaoSeduc: 0,
  });
});

it("preserva P, F, FJ e aulas parcialmente ausentes sem inferir presença a partir das saídas", async () => {
  const frequenciaId = await salvarBase();
  for (const horarioId of horarios) {
    await cliente.query(
      "insert into faltas (frequencia_id, aluno_id, horario_id, justificativa) values ($1, $2, $4, null), ($1, $3, $4, $5)",
      [frequenciaId, alunoDe(1), alunoDe(2), horarioId, codigoJustificativa],
    );
  }
  await cliente.query(
    "insert into faltas (frequencia_id, aluno_id, horario_id) values ($1, $2, $3)",
    [frequenciaId, alunoDe(3), horarios[1]],
  );
  await cliente.query(
    "insert into saidas_antecipadas (aluno_id, dia, momento, horario, texto) values ($1, $2, 'aula_2', '08:00', 'QA Chamada Personalizada saída')",
    [alunoDe(0), dia],
  );
  const registros = await listar();
  expect(registros.map((item) => item.tipo === "CHAMADA" && item.marca)).toEqual([
    "P",
    "F",
    "FJ",
    "S",
  ]);
  expect(registros[3]).toMatchObject({ descricao: "Falta na 2ª aula da Chamada" });
});

it("mantém a falta registrada mesmo quando a aula deixa a grade atual", async () => {
  const frequenciaId = await salvarBase();
  await cliente.query(
    "insert into faltas (frequencia_id, aluno_id, horario_id) values ($1, $2, $3)",
    [frequenciaId, alunoDe(0), horarios[0]],
  );
  await cliente.query("update horarios set ativo = false where id = $1", [horarios[0]]);
  expect((await listar())[0]).toMatchObject({ tipo: "CHAMADA", marca: "F" });
});

it("preserva a confirmação antiga, mas recusa confirmar a base após uma personalização", async () => {
  await salvarBase();
  const confirmacao = {
    alunoId: alunoDe(0),
    turmaId,
    dia,
    registrado: true,
    revisao: 3,
    revisaoSeduc: 0,
  };
  expect((await chamar("/api/frequencias/seduc", "POST", confirmacao)).status).toBe(200);
  const base = (await listar())[0];
  expect(base).toMatchObject({ tipo: "CHAMADA", registradoSeduc: true, revisaoSeduc: 1 });
  const personalizada = await salvarPersonalizacao();
  expect((await listar())[0]).toEqual(personalizada);
  expect(personalizada.registradoSeduc).toBe(false);
  expect(
    (
      await chamar("/api/frequencias/seduc", "POST", {
        ...confirmacao,
        registrado: false,
        revisaoSeduc: 1,
      })
    ).status,
  ).toBe(409);
  const confirmada = await chamar(`/api/frequencias-parciais/${personalizada.id}/seduc`, "POST", {
    registrado: true,
    revisao: personalizada.revisao,
  });
  expect(confirmada.status).toBe(200);
  expect((await listar())[0]).toMatchObject({
    id: personalizada.id,
    tipo: "TURNO",
    registradoSeduc: true,
  });
});

it("a personalização prevalece globalmente e mantém turma e nome salvos após transferência", async () => {
  await salvarBase();
  await cliente.query("update alunos set turma_id = $1 where id = $2", [outraTurmaId, alunoDe(0)]);
  const personalizada = await salvarPersonalizacao(alunoDe(0), outraTurmaId);
  expect((await listar()).some((item) => item.alunoId === alunoDe(0))).toBe(false);
  expect(await listar(`dia=${dia}&turmaId=${outraTurmaId}`)).toEqual([personalizada]);
  expect((await listar(`dia=${dia}`)).filter((item) => item.alunoId === alunoDe(0))).toEqual([
    personalizada,
  ]);
  await cliente.query("update alunos set turma_id = $1 where id = $2", [turmaId, alunoDe(0)]);
  expect(await listar(`dia=${dia}&turmaId=${outraTurmaId}`)).toEqual([personalizada]);
});

it("usa uma única base por aluno e dia mesmo depois de duas chamadas em turmas distintas", async () => {
  const antiga = await salvarBase();
  await cliente.query(
    "update frequencias set atualizado_em = '2026-06-15T10:00:00Z' where id = $1",
    [antiga],
  );
  await salvarBase(outraTurmaId, [alunoDe(0)]);
  expect((await listar()).some((item) => item.alunoId === alunoDe(0))).toBe(false);
  expect(await listar(`dia=${dia}&turmaId=${outraTurmaId}`)).toMatchObject([
    { alunoId: alunoDe(0), tipo: "CHAMADA", turmaId: outraTurmaId },
  ]);
  expect((await listar(`dia=${dia}`)).filter((item) => item.alunoId === alunoDe(0))).toHaveLength(
    1,
  );
  expect(
    (
      await chamar("/api/frequencias/seduc", "POST", {
        alunoId: alunoDe(0),
        turmaId,
        dia,
        registrado: true,
        revisao: 3,
        revisaoSeduc: 0,
      })
    ).status,
  ).toBe(409);
});

it("consulta o intervalo sem criar cópias ou alterar frequências e confirmações", async () => {
  await salvarBase();
  await salvarBase(turmaId, [alunoDe(4)], "2026-06-16");
  const consultar = () =>
    cliente.query<{ snapshot: unknown }>(
      "select jsonb_build_object('chamadas', (select jsonb_agg(f order by id) from frequencias f where turma_id = $1), 'confirmacoes', (select jsonb_agg(a order by aluno_id) from alunos_chamada a where aluno_id = any($2::uuid[])), 'personalizadas', (select jsonb_agg(p order by id) from frequencias_parciais p where aluno_id = any($2::uuid[]))) as snapshot",
      [turmaId, alunos],
    );
  const antes = (await consultar()).rows[0]?.snapshot;
  const registros = await listar(`de=2026-06-15&ate=2026-06-16&turmaId=${turmaId}`);
  expect(registros).toHaveLength(5);
  expect(registros.at(-1)).toMatchObject({ alunoId: alunoDe(4), dia: "2026-06-16" });
  expect((await consultar()).rows[0]?.snapshot).toEqual(antes);
});
