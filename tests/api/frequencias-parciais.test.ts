// Contratos da chamada parcial e da conferência manual Seduc, com massa própria.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";

const url = process.env.APP_URL ?? "http://localhost:3000";
const prefixo = "QA Parcial CRUD";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const alunos = new Map<string, string>();
const idsCriados = new Set<string>();
let turma = "";
let outraTurma = "";
let cookie = "";
let cookieAdmin = "";
let coordenacao = { id: "", nome: "" };
let administracao = { id: "", nome: "" };

async function chamar(caminho: string, method = "GET", body?: unknown, sessao = cookie) {
  return fetch(`${url}${caminho}`, {
    method,
    headers: { Origin: url, Cookie: sessao, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function entrar(email: string, senha: string) {
  const resposta = await chamar("/api/auth/entrar", "POST", { email, senha }, "");
  expect(resposta.status).toBe(200);
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function alunoDe(nome: string): string {
  const id = alunos.get(nome);
  if (!id) throw new Error("Aluno sintético não preparado.");
  return id;
}

async function salvar(dados: unknown, sessao = cookie): Promise<FrequenciaParcial> {
  const resposta = await chamar("/api/frequencias-parciais", "POST", dados, sessao);
  expect(resposta.status).toBe(200);
  const corpo = (await resposta.json()) as { registro: FrequenciaParcial };
  idsCriados.add(corpo.registro.id);
  return corpo.registro;
}

async function confirmar(
  registro: FrequenciaParcial,
  registrado: boolean,
  sessao = cookie,
): Promise<FrequenciaParcial> {
  const resposta = await chamar(
    `/api/frequencias-parciais/${registro.id}/seduc`,
    "POST",
    { registrado, revisao: registro.revisao },
    sessao,
  );
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { registro: FrequenciaParcial }).registro;
}

async function listar(filtros: string): Promise<FrequenciaParcial[]> {
  const resposta = await chamar(`/api/frequencias-parciais?${filtros}`);
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { registros: FrequenciaParcial[] }).registros;
}

async function limpar() {
  await banco.query(
    "delete from auditoria where alvo = any($1::text[]) or alvo in (select 'parcial:' || p.id::text from frequencias_parciais p join alunos a on a.id = p.aluno_id where a.nome like $2)",
    [[...idsCriados].map((id) => `parcial:${id}`), `${prefixo}%`],
  );
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

beforeAll(async () => {
  await banco.connect();
  await limpar();
  const email = process.env.TESTE_EMAIL ?? "demo@escola.exemplo";
  const emailAdmin = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
  cookie = await entrar(email, process.env.TESTE_SENHA ?? "DemoFrequencia2026");
  cookieAdmin = await entrar(emailAdmin, process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026");
  const contas = await banco.query<{ id: string; nome: string; email: string }>(
    "select id, nome, email from usuarios where email = any($1::text[])",
    [[email, emailAdmin]],
  );
  coordenacao = contas.rows.find((conta) => conta.email === email) ?? coordenacao;
  administracao = contas.rows.find((conta) => conta.email === emailAdmin) ?? administracao;
  expect(coordenacao.id).not.toBe("");
  expect(administracao.id).not.toBe("");
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 98) returning id",
    [prefixo],
  );
  const turmas = await banco.query<{ id: string; nome: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A'), ($1, 'B') returning id, nome",
    [serie.rows[0]?.id],
  );
  turma = turmas.rows.find((item) => item.nome === "A")?.id ?? "";
  outraTurma = turmas.rows.find((item) => item.nome === "B")?.id ?? "";
  for (const [indice, nome] of [
    "Turno",
    "Aulas",
    "Seduc",
    "Correcao",
    "Concorrencia",
    "Snapshot",
    "Inativo",
    "Desistente",
    "Isolamento",
    "Remocao",
  ].entries()) {
    const resultado = await banco.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3) returning id",
      [`${prefixo} ${nome}`, turma, indice + 1],
    );
    alunos.set(nome, resultado.rows[0]?.id ?? "");
  }
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("frequências parciais", () => {
  it("exige sessão e origem válida em todas as alterações", async () => {
    const id = randomUUID();
    const caminhos = [
      { caminho: "/api/frequencias-parciais", metodo: "POST" },
      { caminho: `/api/frequencias-parciais/${id}/seduc`, metodo: "POST" },
      { caminho: `/api/frequencias-parciais/${id}`, metodo: "DELETE" },
    ];
    expect(
      (await chamar("/api/frequencias-parciais?dia=2026-06-01", "GET", undefined, "")).status,
    ).toBe(401);
    for (const { caminho, metodo } of caminhos) {
      expect((await chamar(caminho, metodo, {}, "")).status).toBe(401);
      const resposta = await fetch(`${url}${caminho}`, {
        method: metodo,
        headers: {
          Cookie: cookie,
          Origin: "https://exemplo.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(resposta.status).toBe(403);
    }
  });

  it("valida turno, aulas, observação, revisão, datas e filtros", async () => {
    const dados = {
      alunoId: alunoDe("Turno"),
      turmaId: turma,
      dia: "2026-06-01",
      tipo: "TURNO",
      turno: "MANHA",
    };
    for (const alteracao of [
      { alunoId: "inválido" },
      { dia: "2026-02-30" },
      { dia: "2999-06-01" },
      { turno: "NOITE" },
      { turno: null },
      { aulas: [1] },
      { tipo: "AULAS", turno: null, aulas: [] },
      { tipo: "AULAS", aulas: [1] },
      { tipo: "AULAS", turno: null, aulas: [0] },
      { tipo: "AULAS", turno: null, aulas: [31] },
      { observacao: "a".repeat(301) },
      { revisao: -1 },
      { registradoSeduc: true },
    ])
      expect(
        (await chamar("/api/frequencias-parciais", "POST", { ...dados, ...alteracao })).status,
      ).toBe(400);
    for (const filtros of [
      "dia=inválido",
      "de=2026-06-01",
      "de=2026-06-02&ate=2026-06-01",
      "de=2026-01-01&ate=2026-06-01",
      "dia=2026-06-01&de=2026-06-01&ate=2026-06-02",
      "turmaId=inválido",
    ])
      expect((await chamar(`/api/frequencias-parciais?${filtros}`)).status).toBe(400);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", { ...dados, alunoId: randomUUID() }))
        .status,
    ).toBe(404);
  });

  it("registra turno e aulas selecionadas e mantém presença parcial separada", async () => {
    const turno = await salvar({
      alunoId: alunoDe("Turno"),
      turmaId: turma,
      dia: "2026-06-01",
      tipo: "TURNO",
      turno: "MANHA",
      revisao: 0,
    });
    const aulas = await salvar(
      {
        alunoId: alunoDe("Aulas"),
        turmaId: turma,
        dia: "2026-06-01",
        tipo: "AULAS",
        aulas: [5, 3, 4, 3],
        observacao: "  Chegou na terceira aula  ",
      },
      cookieAdmin,
    );
    expect(turno).toMatchObject({
      tipo: "TURNO",
      turno: "MANHA",
      aulas: [],
      revisao: 1,
      registradoSeduc: false,
      registradoSeducEm: null,
      registradoSeducPorNome: null,
      turmaNome: `${prefixo} A`,
    });
    expect(aulas).toMatchObject({
      tipo: "AULAS",
      turno: null,
      aulas: [3, 4, 5],
      observacao: "Chegou na terceira aula",
      revisao: 1,
    });
    const registros = await listar(`dia=2026-06-01&turmaId=${turma}`);
    expect(registros.map((item) => item.id).sort()).toEqual([turno.id, aulas.id].sort());
    expect(await listar(`de=2026-06-01&ate=2026-06-02&turmaId=${outraTurma}`)).toEqual([]);
    const totais = await banco.query<{ frequencias: number; saidas: number; entradas: number }>(
      "select (select count(*)::int from frequencias where turma_id = $1 and dia = '2026-06-01') as frequencias, (select count(*)::int from saidas_antecipadas where aluno_id = any($2::uuid[])) as saidas, (select count(*)::int from entradas_atrasadas where aluno_id = any($2::uuid[])) as entradas",
      [turma, [alunoDe("Turno"), alunoDe("Aulas")]],
    );
    expect(totais.rows[0]).toEqual({ frequencias: 0, saidas: 0, entradas: 0 });
    expect(
      (
        await chamar("/api/frequencias-parciais", "POST", {
          alunoId: alunoDe("Turno"),
          dia: "2026-06-01",
          tipo: "TURNO",
          turno: "TARDE",
        })
      ).status,
    ).toBe(409);
  });

  it("confirma manualmente na Seduc, preserva autoria em no-op e permite reabrir", async () => {
    const dados = {
      alunoId: alunoDe("Seduc"),
      turmaId: turma,
      dia: "2026-06-02",
      tipo: "TURNO",
      turno: "TARDE",
    };
    const criada = await salvar(dados);
    const confirmada = await confirmar(criada, true);
    expect(confirmada).toMatchObject({
      registradoSeduc: true,
      registradoSeducPorNome: coordenacao.nome,
      revisao: 2,
    });
    expect(confirmada.registradoSeducEm).toEqual(expect.any(String));
    const autoria = await banco.query<{ registrado_seduc_por_id: string }>(
      "select registrado_seduc_por_id from frequencias_parciais where id = $1",
      [criada.id],
    );
    expect(autoria.rows[0]?.registrado_seduc_por_id).toBe(coordenacao.id);
    expect(await confirmar(confirmada, true, cookieAdmin)).toEqual(confirmada);
    expect(await salvar({ ...dados, revisao: confirmada.revisao }, cookieAdmin)).toEqual(
      confirmada,
    );
    expect((await listar(`dia=2026-06-02&turmaId=${turma}`))[0]).toEqual(confirmada);
    const reaberta = await confirmar(confirmada, false, cookieAdmin);
    expect(reaberta).toMatchObject({
      registradoSeduc: false,
      registradoSeducEm: null,
      registradoSeducPorNome: null,
      revisao: 3,
    });
    const reconfirmada = await confirmar(reaberta, true, cookieAdmin);
    expect(reconfirmada).toMatchObject({
      registradoSeduc: true,
      registradoSeducPorNome: administracao.nome,
      revisao: 4,
    });
    const acoes = await banco.query<{ acao: string }>(
      "select acao from auditoria where alvo = $1 order by criado_em, id",
      [`parcial:${criada.id}`],
    );
    expect(acoes.rows.map((item) => item.acao).sort()).toEqual(
      [
        "parcial.criar",
        "parcial.confirmarSeduc",
        "parcial.reabrirSeduc",
        "parcial.confirmarSeduc",
      ].sort(),
    );
  });

  it("correção limpa a confirmação Seduc e recusa edição, confirmação e remoção antigas", async () => {
    const dados = {
      alunoId: alunoDe("Correcao"),
      turmaId: turma,
      dia: "2026-06-03",
      tipo: "TURNO",
      turno: "MANHA",
    };
    const criada = await salvar(dados);
    const confirmada = await confirmar(criada, true);
    const corrigida = await salvar(
      { ...dados, tipo: "AULAS", turno: null, aulas: [6, 4, 5], revisao: confirmada.revisao },
      cookieAdmin,
    );
    expect(corrigida).toMatchObject({
      revisao: 3,
      aulas: [4, 5, 6],
      registradoSeduc: false,
      registradoSeducEm: null,
      registradoSeducPorNome: null,
    });
    expect(
      (await chamar("/api/frequencias-parciais", "POST", { ...dados, revisao: confirmada.revisao }))
        .status,
    ).toBe(409);
    expect(
      (
        await chamar(`/api/frequencias-parciais/${criada.id}/seduc`, "POST", {
          registrado: true,
          revisao: confirmada.revisao,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await chamar(`/api/frequencias-parciais/${criada.id}`, "DELETE", {
          revisao: confirmada.revisao,
        })
      ).status,
    ).toBe(409);
    expect((await listar(`dia=2026-06-03&turmaId=${turma}`))[0]).toEqual(corrigida);
    const autoria = await banco.query<{
      criado_por_id: string;
      atualizado_por_id: string;
      registrado_seduc_por_id: string | null;
    }>(
      "select criado_por_id, atualizado_por_id, registrado_seduc_por_id from frequencias_parciais where id = $1",
      [criada.id],
    );
    expect(autoria.rows[0]).toEqual({
      criado_por_id: coordenacao.id,
      atualizado_por_id: administracao.id,
      registrado_seduc_por_id: null,
    });
  });

  it("duas correções da mesma revisão têm um sucesso e um conflito", async () => {
    const dados = {
      alunoId: alunoDe("Concorrencia"),
      turmaId: turma,
      dia: "2026-06-04",
      tipo: "TURNO",
      turno: "MANHA",
    };
    const criada = await salvar(dados);
    const respostas = await Promise.all([
      chamar("/api/frequencias-parciais", "POST", {
        ...dados,
        turno: "TARDE",
        revisao: criada.revisao,
      }),
      chamar(
        "/api/frequencias-parciais",
        "POST",
        { ...dados, tipo: "AULAS", turno: null, aulas: [3, 4], revisao: criada.revisao },
        cookieAdmin,
      ),
    ]);
    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([200, 409]);
    const sucesso = respostas.find((resposta) => resposta.status === 200);
    expect(sucesso).toBeDefined();
    const salva = ((await sucesso?.json()) as { registro: FrequenciaParcial }).registro;
    expect(salva.revisao).toBe(2);
    expect((await listar(`dia=2026-06-04&turmaId=${turma}`))[0]).toEqual(salva);
  });

  it("preserva nome e turma históricos depois de transferência e renomeação", async () => {
    const alunoId = alunoDe("Snapshot");
    const dados = { alunoId, turmaId: turma, dia: "2026-06-05", tipo: "TURNO", turno: "MANHA" };
    const criada = await salvar(dados);
    await banco.query("update alunos set nome = $1, turma_id = $2 where id = $3", [
      `${prefixo} Snapshot alterado`,
      outraTurma,
      alunoId,
    ]);
    await banco.query("update turmas set nome = 'A alterada' where id = $1", [turma]);
    try {
      expect((await listar(`dia=2026-06-05&turmaId=${turma}`))[0]).toEqual(criada);
      expect(await listar(`dia=2026-06-05&turmaId=${outraTurma}`)).toEqual([]);
      expect(
        (
          await chamar("/api/frequencias-parciais", "POST", {
            ...dados,
            turmaId: outraTurma,
            turno: "TARDE",
            revisao: criada.revisao,
          })
        ).status,
      ).toBe(409);
      const corrigida = await salvar({ ...dados, turno: "TARDE", revisao: criada.revisao });
      expect(corrigida).toMatchObject({
        alunoNome: `${prefixo} Snapshot`,
        turmaNome: `${prefixo} A`,
        turmaId: turma,
      });
      expect(
        (await chamar("/api/frequencias-parciais", "POST", { ...dados, dia: "2026-06-06" })).status,
      ).toBe(409);
      const nova = await salvar({ ...dados, turmaId: outraTurma, dia: "2026-06-06" });
      expect(nova).toMatchObject({
        alunoNome: `${prefixo} Snapshot alterado`,
        turmaNome: `${prefixo} B`,
        turmaId: outraTurma,
      });
    } finally {
      await banco.query("update turmas set nome = 'A' where id = $1", [turma]);
    }
  });

  it("bloqueia novo registro de aluno inativo ou desistente e permite corrigir o histórico", async () => {
    const inativo = {
      alunoId: alunoDe("Inativo"),
      turmaId: turma,
      dia: "2026-06-14",
      tipo: "TURNO",
      turno: "MANHA",
    };
    const desistente = {
      alunoId: alunoDe("Desistente"),
      turmaId: turma,
      dia: "2026-06-14",
      tipo: "TURNO",
      turno: "TARDE",
    };
    const registroInativo = await salvar(inativo);
    const registroDesistente = await salvar(desistente);
    await banco.query("update alunos set ativo = false where id = $1", [inativo.alunoId]);
    await banco.query("update alunos set desistente_em = '2026-06-15' where id = $1", [
      desistente.alunoId,
    ]);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", { ...inativo, dia: "2026-06-15" })).status,
    ).toBe(409);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", { ...desistente, dia: "2026-06-15" }))
        .status,
    ).toBe(409);
    expect(
      (await salvar({ ...inativo, turno: "TARDE", revisao: registroInativo.revisao })).revisao,
    ).toBe(2);
    expect(
      (await salvar({ ...desistente, turno: "MANHA", revisao: registroDesistente.revisao }))
        .revisao,
    ).toBe(2);
    expect((await salvar({ ...desistente, dia: "2026-06-13" })).dia).toBe("2026-06-13");
  });

  it("salvar, confirmar, corrigir e remover não alteram chamada, saída ou entrada existentes", async () => {
    const alunoId = alunoDe("Isolamento");
    const dia = "2026-06-17";
    await banco.query(
      "insert into frequencias (turma_id, dia, revisao, atualizado_em) values ($1, $2, 7, now())",
      [turma, dia],
    );
    await banco.query(
      "insert into saidas_antecipadas (aluno_id, dia, momento, horario, texto) values ($1, $2, 'aula_4', '11:00', 'QA Parcial CRUD saída')",
      [alunoId, dia],
    );
    await banco.query(
      "insert into entradas_atrasadas (aluno_id, turma_id, turma_rotulo, dia, horario, motivo, registrado_por_nome) values ($1, $2, $3, $4, '08:15', 'QA Parcial CRUD entrada', 'QA Parcial CRUD autoria')",
      [alunoId, turma, `${prefixo} A`, dia],
    );
    const consultar = () =>
      banco.query<{ snapshot: unknown }>(
        "select jsonb_build_object('frequencias', (select jsonb_agg(f) from frequencias f where turma_id = $1 and dia = $3::date), 'saidas', (select jsonb_agg(s) from saidas_antecipadas s where aluno_id = $2 and dia = $3::date), 'entradas', (select jsonb_agg(e) from entradas_atrasadas e where aluno_id = $2 and dia = $3::date)) as snapshot",
        [turma, alunoId, dia],
      );
    const antes = (await consultar()).rows[0]?.snapshot;
    const criada = await salvar({ alunoId, turmaId: turma, dia, tipo: "TURNO", turno: "TARDE" });
    const confirmada = await confirmar(criada, true);
    const corrigida = await salvar({
      alunoId,
      turmaId: turma,
      dia,
      tipo: "AULAS",
      aulas: [3, 4],
      revisao: confirmada.revisao,
    });
    expect(
      (
        await chamar(`/api/frequencias-parciais/${corrigida.id}`, "DELETE", {
          revisao: corrigida.revisao,
        })
      ).status,
    ).toBe(200);
    expect((await consultar()).rows[0]?.snapshot).toEqual(antes);
  });

  it("remove apenas a revisão corrente e registra auditoria", async () => {
    const dados = {
      alunoId: alunoDe("Remocao"),
      turmaId: turma,
      dia: "2026-06-18",
      tipo: "TURNO",
      turno: "MANHA",
    };
    const criada = await salvar(dados);
    expect(
      (await chamar(`/api/frequencias-parciais/${criada.id}/seduc`, "POST", { registrado: true }))
        .status,
    ).toBe(400);
    expect((await chamar(`/api/frequencias-parciais/${criada.id}`, "DELETE", {})).status).toBe(400);
    expect(
      (
        await chamar(`/api/frequencias-parciais/${criada.id}`, "DELETE", {
          revisao: criada.revisao,
        })
      ).status,
    ).toBe(200);
    expect(await listar(`dia=2026-06-18&turmaId=${turma}`)).toEqual([]);
    expect(
      (
        await chamar(`/api/frequencias-parciais/${criada.id}`, "DELETE", {
          revisao: criada.revisao,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await chamar(`/api/frequencias-parciais/${criada.id}/seduc`, "POST", {
          registrado: true,
          revisao: criada.revisao,
        })
      ).status,
    ).toBe(404);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", { ...dados, revisao: 2 })).status,
    ).toBe(409);
    const auditoria = await banco.query<{ total: number }>(
      "select count(*)::int as total from auditoria where acao = 'parcial.remover' and alvo = $1",
      [`parcial:${criada.id}`],
    );
    expect(auditoria.rows[0]?.total).toBe(1);
  });
});
