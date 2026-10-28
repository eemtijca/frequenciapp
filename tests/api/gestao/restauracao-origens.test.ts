// Volta às turmas de origem: permissões, conferência da prévia aluno por aluno, escopo por série,
// histórico preservado, saídas reagrupadas, repetição idempotente e concorrência com a reorganização.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Restaurar Origem";
const outra = "QA Restaurar Outra";
let admin = "";
let coordenacao = "";
let serieId = "";
const turmas: Record<string, string> = {};
const ids: Record<string, string> = {};

async function chamar(
  caminho: string,
  metodo = "POST",
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

async function limpar() {
  for (const nome of [prefixo, outra]) {
    await banco.query(
      "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
      [nome],
    );
    await banco.query(
      "delete from alunos where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1) or turma_original_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
      [nome],
    );
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [nome],
    );
    await banco.query("delete from series where nome = $1", [nome]);
  }
}

async function situacao() {
  return (
    await banco.query<{ nome: string; turma_id: string; turma_original_id: string; ordem: number }>(
      "select nome, turma_id, turma_original_id, ordem from alunos where nome like 'QA Restaurar%' order by nome",
    )
  ).rows;
}

async function historico() {
  const parametros = Object.values(turmas);
  const consulta = async (sql: string) => (await banco.query(sql, [parametros])).rows as unknown[];
  return {
    chamadas: await consulta(
      "select to_jsonb(f) as registro from frequencias f where turma_id = any($1::uuid[]) order by id",
    ),
    faltas: await consulta(
      "select to_jsonb(f) as registro from faltas f where frequencia_id in (select id from frequencias where turma_id = any($1::uuid[])) order by frequencia_id, aluno_id, horario_id",
    ),
    participantes: await consulta(
      "select to_jsonb(p) as registro from alunos_chamada p where frequencia_id in (select id from frequencias where turma_id = any($1::uuid[])) order by frequencia_id, aluno_id",
    ),
  };
}

type ItemDaPrevia = { id: string; turmaId: string; turmaOriginalId: string };

/** A prévia que a Gestão monta: remanejados com turma atual e de origem na série. */
async function previaAtual(): Promise<ItemDaPrevia[]> {
  return (
    await banco.query<ItemDaPrevia>(
      `select a.id, a.turma_id as "turmaId", a.turma_original_id as "turmaOriginalId"
         from alunos a
         join turmas atual on atual.id = a.turma_id
         join turmas origem on origem.id = a.turma_original_id
        where atual.serie_id = $1 and origem.serie_id = $1 and a.turma_id <> a.turma_original_id
        order by a.id`,
      [serieId],
    )
  ).rows;
}

async function restaurar(previa: ItemDaPrevia[]) {
  return chamar("/api/alunos/restaurar-origens", "POST", { serieId, previa, confirmar: true });
}

async function mover(nome: string, destino: string) {
  await ler(await chamar(`/api/alunos/${ids[nome]}`, "PATCH", { turmaId: turmas[destino] }));
}

async function saidasPorTurma() {
  const dados = await ler<{
    turmas: { turmaId: string; movimentacoes: { alunoId: string; tipo: string }[] }[];
  }>(await chamar("/api/relatorios/movimentacoes?de=2026-06-23&ate=2026-06-23", "GET"));
  const porAluno = new Map<string, string>();
  for (const grupo of dados.turmas) {
    for (const item of grupo.movimentacoes) {
      if (item.tipo === "SAIDA") porAluno.set(item.alunoId, grupo.turmaId);
    }
  }
  return porAluno;
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  for (const [email, senha, papel] of [
    ["direcao@escola.exemplo", "DirecaoFrequencia2026", "admin"],
    ["demo@escola.exemplo", "DemoFrequencia2026", "coordenacao"],
  ] as const) {
    const resposta = await chamar("/api/auth/entrar", "POST", { login: email, senha }, "");
    expect(resposta.status).toBe(200);
    const cookie = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (papel === "admin") admin = cookie;
    else coordenacao = cookie;
  }
  for (const [nomeSerie, ordem, nomesTurma] of [
    [prefixo, 96, ["A", "B"]],
    [outra, 97, ["X", "Y"]],
  ] as const) {
    const { serie } = await ler<{ serie: { id: string } }>(
      await chamar("/api/series", "POST", { nome: nomeSerie, ordem }),
      201,
    );
    if (nomeSerie === prefixo) serieId = serie.id;
    for (const nome of nomesTurma) {
      const { turma } = await ler<{ turma: { id: string } }>(
        await chamar("/api/turmas", "POST", { nome, serieId: serie.id }),
        201,
      );
      turmas[nome] = turma.id;
    }
  }
  // Cada aluno nasce na turma de origem; o remanejamento muda só a turma atual.
  for (const [nome, origem] of [
    ["Bruna", "A"],
    ["Elisa", "A"],
    ["Álvaro", "A"],
    ["Carla", "B"],
    ["Davi", "B"],
    ["Xavier", "X"],
    ["Hugo", "X"],
  ] as const) {
    const { aluno } = await ler<{ aluno: { id: string } }>(
      await chamar("/api/alunos", "POST", {
        nome: `QA Restaurar ${nome}`,
        turmaId: turmas[origem],
      }),
      201,
    );
    ids[nome] = aluno.id;
  }
  for (const [nome, destino] of [
    ["Álvaro", "B"],
    ["Elisa", "B"],
    ["Davi", "A"],
    ["Xavier", "Y"],
    // Hugo mudou de série e manteve a origem antiga: a restauração da série não o devolve.
    ["Hugo", "A"],
  ] as const) {
    await mover(nome, destino);
  }
  await ler(
    await chamar("/api/frequencias", "POST", {
      turmaId: turmas.A,
      dia: "2026-06-23",
      faltas: [ids.Davi],
      revisao: 0,
    }),
  );
  // Saída registrada durante o remanejamento: o relatório agrupa pela turma atual do aluno.
  await banco.query(
    "insert into saidas_antecipadas (aluno_id, dia, momento, horario, texto) values ($1, '2026-06-23', 'aula_2', '09:00', 'QA Restaurar')",
    [ids.Davi],
  );
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("restauração das turmas de origem", () => {
  it("exige administração, origem confiável, confirmação e série existente", async () => {
    const antes = await situacao();
    const corpo = { serieId, previa: await previaAtual(), confirmar: true };
    for (const [entrada, cookie, origem, status] of [
      [corpo, "", url, 401],
      [corpo, coordenacao, url, 403],
      [corpo, admin, "https://origem-invalida.exemplo", 403],
      [{ ...corpo, confirmar: false }, admin, url, 400],
      [{ serieId, confirmar: true }, admin, url, 400],
      [{ ...corpo, previa: [] }, admin, url, 400],
      [{ ...corpo, esperados: 3 }, admin, url, 400],
      [{ ...corpo, serieId: "00000000-0000-4000-8000-000000000999" }, admin, url, 404],
    ] as const)
      expect(
        (await chamar("/api/alunos/restaurar-origens", "POST", entrada, cookie, origem)).status,
      ).toBe(status);
    expect(await situacao()).toEqual(antes);
  });

  it("recusa a prévia com a mesma contagem e outros alunos, sem mexer em ninguém", async () => {
    const previa = await previaAtual();
    expect(previa.map((item) => item.id).sort()).toEqual([ids.Álvaro, ids.Davi, ids.Elisa].sort());
    // Elisa volta sozinha e Carla vai para a turma A: continuam três fora da origem.
    await mover("Elisa", "A");
    await mover("Carla", "A");
    expect(await previaAtual()).toHaveLength(previa.length);
    const antes = await situacao();
    const resposta = await restaurar(previa);
    expect(resposta.status).toBe(409);
    expect(((await resposta.json()) as { error: string }).error).toContain("Confira de novo");
    expect(await situacao()).toEqual(antes);
    // A prévia com um aluno a menos também é recusada.
    expect((await restaurar((await previaAtual()).slice(1))).status).toBe(409);
    await mover("Elisa", "B");
    await mover("Carla", "B");
    expect(await previaAtual()).toEqual(previa);
  });

  it("devolve os alunos da série, renumera só as turmas afetadas e preserva o histórico", async () => {
    const registros = await historico();
    expect(registros.faltas.length).toBeGreaterThan(0);
    expect((await saidasPorTurma()).get(ids.Davi ?? "")).toBe(turmas.A);
    const previa = await previaAtual();
    const resultado = await ler<{ alunos: number; turmas: number; jaAplicado: boolean }>(
      await restaurar(previa),
    );
    expect(resultado).toEqual({ alunos: 3, turmas: 2, jaAplicado: false });
    const depois = await situacao();
    const turmaDe = (nome: string) => depois.find((item) => item.nome.endsWith(nome));
    for (const [nome, turma, ordem] of [
      ["Álvaro", "A", 1],
      ["Bruna", "A", 2],
      ["Elisa", "A", 3],
      ["Carla", "B", 1],
      ["Davi", "B", 2],
    ] as const) {
      expect(turmaDe(nome)).toMatchObject({
        turma_id: turmas[turma],
        turma_original_id: turmas[turma],
        ordem,
      });
    }
    // Hugo, que veio de outra série, continua na turma A, depois dos que voltaram.
    expect(turmaDe("Hugo")).toMatchObject({
      turma_id: turmas.A,
      turma_original_id: turmas.X,
      ordem: 4,
    });
    // A outra série tem uma transferência permanente e fica como estava.
    expect(turmaDe("Xavier")).toMatchObject({
      turma_id: turmas.Y,
      turma_original_id: turmas.X,
    });
    expect(await historico()).toEqual(registros);
    // A saída não tem turma gravada: passa a aparecer na turma de origem do aluno.
    expect((await saidasPorTurma()).get(ids.Davi ?? "")).toBe(turmas.B);
    const resumo = await banco.query(
      "select alvo from auditoria where acao = 'aluno.restaurar_origens' and alvo like $1",
      [`serie:${serieId}:%`],
    );
    expect(resumo.rows[0]?.alvo).toBe(`serie:${serieId}:alunos:3:turmas:2`);
    // Uma linha por aluno atingido, só com identificadores e a numeração anterior e nova.
    const porAluno = await banco.query<{ alvo: string }>(
      "select alvo from auditoria where acao = 'aluno.restaurar_origem' and alvo like any($1::text[])",
      [Object.values(ids).map((aluno) => `aluno:${aluno}:%`)],
    );
    const linha = (nome: string) =>
      porAluno.rows.find((item) => item.alvo.startsWith(`aluno:${ids[nome]}:`))?.alvo;
    // Davi volta para a turma B; a numeração só entra na linha quando muda.
    expect(linha("Davi")).toMatch(
      new RegExp(`^aluno:${ids.Davi}:de:${turmas.A}:para:${turmas.B}(:ordem:\\d+:2)?$`),
    );
    expect(linha("Hugo")).toMatch(new RegExp(`^aluno:${ids.Hugo}:ordem:\\d+:4$`));
    expect(linha("Xavier")).toBeUndefined();
    expect(porAluno.rows.every((item) => !item.alvo.includes("QA"))).toBe(true);
  });

  it("responde que já estava aplicada ao repetir a mesma prévia", async () => {
    const antes = await situacao();
    const item = (nome: string, atual: string, origem: string) => ({
      id: ids[nome] ?? "",
      turmaId: turmas[atual] ?? "",
      turmaOriginalId: turmas[origem] ?? "",
    });
    const previa = [item("Álvaro", "B", "A"), item("Elisa", "B", "A"), item("Davi", "A", "B")];
    const resultado = await ler<{ alunos: number; turmas: number; jaAplicado: boolean }>(
      await restaurar(previa),
    );
    expect(resultado).toEqual({ alunos: 0, turmas: 0, jaAplicado: true });
    expect(await situacao()).toEqual(antes);
  });

  it("concorre com Reorganizar turmas sem deixar numeração repetida", async () => {
    await mover("Álvaro", "B");
    await mover("Davi", "A");
    const previa = await previaAtual();
    expect(previa).toHaveLength(2);
    const [restauracao, ordenacao] = await Promise.all([
      restaurar(previa),
      chamar("/api/turmas/ordenar", "POST", { confirmar: true }),
    ]);
    expect(restauracao.status).toBe(200);
    expect(ordenacao.status).toBe(200);
    expect(await previaAtual()).toEqual([]);
    const repetidas = await banco.query(
      "select turma_id, ordem from alunos where turma_id = any($1::uuid[]) group by turma_id, ordem having count(*) > 1",
      [Object.values(turmas)],
    );
    expect(repetidas.rows).toEqual([]);
    const depois = await situacao();
    expect(
      depois
        .filter((item) => item.turma_id === turmas.A)
        .map((item) => item.ordem)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
  });
});
