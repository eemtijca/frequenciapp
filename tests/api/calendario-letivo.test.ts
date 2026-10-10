// Contratos do calendário escolar anual e de sua preservação no histórico e na cópia.
// Usa somente turmas, alunos e feriados sintéticos próprios em anos passados.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { CopiaFrequenciapp } from "@/application/backup";
import type { Feriado } from "@/domain/calendario-letivo";
import type { Frequencia, Configuracoes } from "@/domain/frequencia";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Calendário API";
const dia = "1990-05-01";
const sabado = "1990-05-05";
let cookieAdmin = "";
let cookieEquipe = "";
let serieId = "";
let turmaId = "";
let outraTurmaId = "";
let alunoId = "";

async function chamar(
  caminho: string,
  metodo = "GET",
  corpo?: unknown,
  sessao = cookieAdmin,
  origem = url,
) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: sessao, Origin: origem, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function criar(data = dia, nome = `${prefixo} Feriado`): Promise<Feriado> {
  const resposta = await chamar("/api/calendario-letivo", "POST", { dia: data, nome });
  expect(resposta.status).toBe(201);
  return ((await resposta.json()) as { feriado: Feriado }).feriado;
}

async function listar(ano = 1990): Promise<Feriado[]> {
  const resposta = await chamar(
    `/api/calendario-letivo?ano=${ano}`,
    "GET",
    undefined,
    cookieEquipe,
  );
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get("cache-control")).toContain("no-store");
  return ((await resposta.json()) as { feriados: Feriado[] }).feriados;
}

function chamada(data = dia, turma = turmaId, extras: Record<string, unknown> = {}) {
  return { dia: data, turmaId: turma, faltas: [], revisao: 0, ...extras };
}

function parcial(data = dia) {
  return { alunoId, turmaId, dia: data, tipo: "DIA_INTEIRO", aulas: [], revisao: 0 };
}

async function limparRegistros() {
  await banco.query("delete from frequencias_parciais where aluno_nome like $1", [`${prefixo}%`]);
  await banco.query(
    "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
    [prefixo],
  );
  // A data é global; a limpeza só alcança feriados identificados por esta suíte.
  await banco.query("delete from feriados where nome like $1", [`${prefixo}%`]);
}

async function limpar() {
  await limparRegistros();
  await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await banco.query("delete from series where nome = $1", [prefixo]);
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  for (const admin of [true, false]) {
    const entrada = await chamar(
      "/api/auth/entrar",
      "POST",
      {
        email: admin
          ? (process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo")
          : (process.env.TESTE_EMAIL ?? "demo@escola.exemplo"),
        senha: admin
          ? (process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026")
          : (process.env.TESTE_SENHA ?? "DemoFrequencia2026"),
      },
      "",
    );
    expect(entrada.status).toBe(200);
    const cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (admin) cookieAdmin = cookie;
    else cookieEquipe = cookie;
  }
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 98) returning id",
    [prefixo],
  );
  serieId = serie.rows[0]?.id ?? "";
  const turmas = await banco.query<{ id: string; nome: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A'), ($1, 'B') returning id, nome",
    [serieId],
  );
  turmaId = turmas.rows.find((item) => item.nome === "A")?.id ?? "";
  outraTurmaId = turmas.rows.find((item) => item.nome === "B")?.id ?? "";
  const aluno = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, 1) returning id",
    [`${prefixo} Aluno`, turmaId],
  );
  alunoId = aluno.rows[0]?.id ?? "";
  for (const turma of [turmaId, outraTurmaId]) {
    await banco.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2)",
      [turma, [1, 2, 3, 4, 5]],
    );
  }
});
beforeEach(limparRegistros);
afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("calendário escolar por ano", () => {
  it("permite consultar à equipe e restringe cadastro e exclusão à administração", async () => {
    expect((await chamar("/api/calendario-letivo?ano=1990", "GET", undefined, "")).status).toBe(
      401,
    );
    for (const sessao of ["", cookieEquipe]) {
      const esperado = sessao ? 403 : 401;
      expect(
        (
          await chamar(
            "/api/calendario-letivo",
            "POST",
            { dia, nome: `${prefixo} Restrito` },
            sessao,
          )
        ).status,
      ).toBe(esperado);
      expect(
        (await chamar(`/api/calendario-letivo/${dia}`, "DELETE", undefined, sessao)).status,
      ).toBe(esperado);
    }
    expect((await listar()).filter((item) => item.nome.startsWith(prefixo))).toEqual([]);
  });

  it("bloqueia mutações de outra origem, inclusive quando a sessão é administrativa", async () => {
    for (const [caminho, metodo, corpo] of [
      ["/api/calendario-letivo", "POST", { dia, nome: `${prefixo} Origem` }],
      [`/api/calendario-letivo/${dia}`, "DELETE", undefined],
    ] as const) {
      expect(
        (await chamar(caminho, metodo, corpo, cookieAdmin, "https://origem.exemplo")).status,
      ).toBe(403);
    }
    expect((await listar()).filter((item) => item.nome.startsWith(prefixo))).toEqual([]);
  });

  it("persiste datas explícitas, ordena os feriados e não repete a data em outro ano", async () => {
    await criar("1990-05-10", `${prefixo} Segundo`);
    await criar(dia, `  ${prefixo} Primeiro  `);
    await criar("1988-02-29", `${prefixo} Bissexto`);
    expect((await listar()).filter((item) => item.nome.startsWith(prefixo))).toEqual([
      { dia, nome: `${prefixo} Primeiro` },
      { dia: "1990-05-10", nome: `${prefixo} Segundo` },
    ]);
    expect((await listar(1988)).filter((item) => item.nome.startsWith(prefixo))).toEqual([
      { dia: "1988-02-29", nome: `${prefixo} Bissexto` },
    ]);
    expect((await listar(1991)).filter((item) => item.nome.startsWith(prefixo))).toEqual([]);
    const resposta = await chamar("/api/configuracoes", "GET", undefined, cookieEquipe);
    expect(resposta.status).toBe(200);
    const configuracoes = ((await resposta.json()) as { configuracoes: Configuracoes })
      .configuracoes;
    expect(configuracoes.feriados).toContainEqual({ dia, nome: `${prefixo} Primeiro` });
    const persistidos = await banco.query(
      "select nome, criado_por_id, criado_em, atualizado_em from feriados where dia = $1",
      [dia],
    );
    expect(persistidos.rows[0]).toMatchObject({
      nome: `${prefixo} Primeiro`,
      criado_por_id: expect.any(String),
      criado_em: expect.any(Date),
      atualizado_em: expect.any(Date),
    });
  });

  it("recusa anos, datas e nomes inválidos sem alterar o calendário", async () => {
    for (const ano of ["1899", "2200", "1990.5", "199", "19xx", ""]) {
      expect((await chamar(`/api/calendario-letivo?ano=${ano}`)).status).toBe(400);
    }
    for (const dados of [
      { dia: "1990-02-30", nome: `${prefixo} Data` },
      { dia: "1990-2-01", nome: `${prefixo} Data` },
      { dia: "1989-02-29", nome: `${prefixo} Data` },
      { dia: "1899-05-01", nome: `${prefixo} Ano` },
      { dia: "2200-05-01", nome: `${prefixo} Ano` },
      { dia, nome: " " },
      { dia, nome: "a".repeat(121) },
      { dia, nome: `${prefixo} Inesperado`, turmaId },
    ]) {
      expect((await chamar("/api/calendario-letivo", "POST", dados)).status).toBe(400);
    }
    expect((await chamar("/api/calendario-letivo/1990-02-30", "DELETE")).status).toBe(400);
    expect((await listar()).filter((item) => item.nome.startsWith(prefixo))).toEqual([]);
  });

  it("recusa duplicata e mantém o nome da primeira definição", async () => {
    const feriado = await criar();
    expect(
      (await chamar("/api/calendario-letivo", "POST", { dia, nome: `${prefixo} Duplicado` }))
        .status,
    ).toBe(409);
    expect((await listar()).find((item) => item.dia === dia)).toEqual(feriado);
  });

  it("informa o feriado na consulta da chamada e bloqueia todas as turmas e personalizações", async () => {
    const feriado = await criar();
    for (const turma of [turmaId, outraTurmaId]) {
      expect(
        (await chamar("/api/frequencias", "POST", chamada(dia, turma), cookieEquipe)).status,
      ).toBe(400);
      const leitura = await chamar(
        `/api/frequencias?dia=${dia}&turmaId=${turma}`,
        "GET",
        undefined,
        cookieEquipe,
      );
      expect(leitura.status).toBe(200);
      expect(await leitura.json()).toEqual({ frequencia: null, feriado });
    }
    expect(
      (await chamar("/api/frequencias-parciais", "POST", parcial(), cookieEquipe)).status,
    ).toBe(400);
    const escola = await chamar(`/api/frequencias?dia=${dia}`, "GET", undefined, cookieEquipe);
    expect(await escola.json()).toEqual({ frequencias: [], feriado });
    expect(
      (await banco.query("select id from frequencias where dia = $1", [dia])).rows,
    ).toHaveLength(0);
    expect(
      (await banco.query("select id from frequencias_parciais where dia = $1", [dia])).rows,
    ).toHaveLength(0);
  });

  it("mantém o feriado ao tentar liberar um sábado letivo", async () => {
    const feriado = await criar(sabado);
    expect(
      (
        await chamar(
          "/api/frequencias",
          "POST",
          chamada(sabado, turmaId, { sabadoLetivo: true }),
          cookieEquipe,
        )
      ).status,
    ).toBe(400);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", parcial(sabado), cookieEquipe)).status,
    ).toBe(400);
    expect((await listar()).find((item) => item.dia === sabado)).toEqual(feriado);
  });

  it("remove somente o feriado e permite salvar novamente sem mudar a grade semanal", async () => {
    await criar();
    const retirada = await chamar(`/api/calendario-letivo/${dia}`, "DELETE");
    expect(retirada.status).toBe(200);
    expect(await retirada.json()).toEqual({ ok: true });
    expect((await chamar(`/api/calendario-letivo/${dia}`, "DELETE")).status).toBe(404);
    expect((await listar()).some((item) => item.dia === dia)).toBe(false);
    expect((await chamar("/api/frequencias", "POST", chamada(), cookieEquipe)).status).toBe(200);
    expect(
      (await chamar("/api/frequencias-parciais", "POST", parcial(), cookieEquipe)).status,
    ).toBe(200);
    const aulas = await banco.query<{ dias_semana: number[] }>(
      "select dias_semana from horarios where turma_id = $1",
      [turmaId],
    );
    expect(aulas.rows).toEqual([{ dias_semana: [1, 2, 3, 4, 5] }]);
  });

  it("não converte data com chamada regular salva em feriado nem altera a frequência", async () => {
    const salva = await chamar("/api/frequencias", "POST", chamada("1990-05-02"), cookieEquipe);
    expect(salva.status).toBe(200);
    const original = ((await salva.json()) as { frequencia: Frequencia }).frequencia;
    const cadastro = await chamar("/api/calendario-letivo", "POST", {
      dia: original.dia,
      nome: `${prefixo} Com histórico`,
    });
    expect(cadastro.status).toBe(409);
    const leitura = await chamar(
      `/api/frequencias?dia=${original.dia}&turmaId=${turmaId}`,
      "GET",
      undefined,
      cookieEquipe,
    );
    expect(await leitura.json()).toEqual({ frequencia: original, feriado: null });
    expect((await listar()).some((item) => item.dia === original.dia)).toBe(false);
  });

  it("não converte data com frequência parcial salva em feriado", async () => {
    const resposta = await chamar(
      "/api/frequencias-parciais",
      "POST",
      parcial("1990-05-03"),
      cookieEquipe,
    );
    expect(resposta.status).toBe(200);
    const original = (await resposta.json()) as {
      registro: { id: string; dia: string; revisao: number };
    };
    expect(
      (
        await chamar("/api/calendario-letivo", "POST", {
          dia: original.registro.dia,
          nome: `${prefixo} Parcial salva`,
        })
      ).status,
    ).toBe(409);
    const atual = await banco.query("select id, revisao from frequencias_parciais where id = $1", [
      original.registro.id,
    ]);
    expect(atual.rows).toEqual([{ id: original.registro.id, revisao: original.registro.revisao }]);
    expect((await listar()).some((item) => item.dia === original.registro.dia)).toBe(false);
  });

  it("serializa o cadastro de feriado e uma chamada concorrente sem aceitar os dois", async () => {
    const data = "1990-05-14";
    const respostas = await Promise.all([
      chamar("/api/calendario-letivo", "POST", { dia: data, nome: `${prefixo} Concorrente` }),
      chamar("/api/frequencias", "POST", chamada(data), cookieEquipe),
    ]);
    expect(respostas.map((item) => item.status).sort((a, b) => a - b)).toEqual(
      respostas[0]?.status === 201 ? [201, 400] : [200, 409],
    );
    const feriados = await banco.query("select dia from feriados where dia = $1", [data]);
    const chamadas = await banco.query(
      "select id from frequencias where dia = $1 and turma_id = $2",
      [data, turmaId],
    );
    expect(feriados.rows.length + chamadas.rows.length).toBe(1);
  });

  it("exporta e restaura o calendário por mesclagem, preservando feriados e histórico", async () => {
    const feriado = await criar();
    const exportacao = await chamar("/api/backup/exportar", "POST", {
      senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
    });
    expect(exportacao.status).toBe(200);
    const completa = (await exportacao.json()) as CopiaFrequenciapp;
    expect(completa.configuracoes?.feriados).toContainEqual(feriado);
    const copia: CopiaFrequenciapp = {
      formato: completa.formato,
      versao: completa.versao,
      series: [],
      turmas: [],
      horarios: [],
      alunos: [],
      frequencias: [],
      saidas: [],
      justificativas: [],
      configuracoes: { frequenciaPorAula: false, saidaAntecipada: true, feriados: [feriado] },
    };
    expect((await chamar(`/api/calendario-letivo/${dia}`, "DELETE")).status).toBe(200);
    const restaurada = await chamar("/api/backup", "POST", copia);
    expect(restaurada.status).toBe(200);
    expect(await restaurada.json()).toEqual({ adicionadas: 1, identicas: 0, conflitos: 0 });
    expect(await (await chamar("/api/backup", "POST", copia)).json()).toEqual({
      adicionadas: 0,
      identicas: 1,
      conflitos: 0,
    });
    const divergente = structuredClone(copia);
    if (!divergente.configuracoes?.feriados) throw new Error("Calendário sintético ausente.");
    divergente.configuracoes.feriados[0] = { dia, nome: `${prefixo} Outro nome` };
    expect(await (await chamar("/api/backup", "POST", divergente)).json()).toMatchObject({
      conflitos: 1,
    });
    const antiga = structuredClone(copia);
    delete antiga.configuracoes;
    expect((await chamar("/api/backup", "POST", antiga)).status).toBe(200);
    expect((await listar()).find((item) => item.dia === dia)).toEqual(feriado);

    const historico: CopiaFrequenciapp = {
      ...antiga,
      series: completa.series.filter((item) => item.id === serieId),
      turmas: completa.turmas.filter((item) => item.id === turmaId),
      horarios: completa.horarios.filter((item) => item.turmaId === turmaId),
      alunos: completa.alunos.filter((item) => item.id === alunoId),
      frequencias: [{ dia, turmaId, revisao: 1, faltas: [], alunos: [alunoId] }],
    };
    const conflitante = await chamar("/api/backup", "POST", historico);
    expect(conflitante.status).toBe(200);
    expect(await conflitante.json()).toMatchObject({ adicionadas: 0, conflitos: 1 });
    expect(
      (
        await banco.query("select id from frequencias where dia = $1 and turma_id = $2", [
          dia,
          turmaId,
        ])
      ).rows,
    ).toHaveLength(0);

    historico.frequencias[0] = {
      dia: "1990-05-08",
      turmaId,
      revisao: 1,
      faltas: [],
      alunos: [alunoId],
    };
    historico.configuracoes = {
      frequenciaPorAula: false,
      saidaAntecipada: true,
      feriados: [{ dia: "1990-05-08", nome: `${prefixo} Conflito da cópia` }],
    };
    const interna = await chamar("/api/backup", "POST", historico);
    expect(interna.status).toBe(200);
    expect(await interna.json()).toMatchObject({ adicionadas: 1, conflitos: 1 });
    expect((await listar()).some((item) => item.dia === "1990-05-08")).toBe(false);
    expect(
      (
        await banco.query("select id from frequencias where dia = '1990-05-08' and turma_id = $1", [
          turmaId,
        ])
      ).rows,
    ).toHaveLength(1);
  });
});
