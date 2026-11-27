// Contrato das provas específicas: acesso da administração e da coordenação, validação, inscrição de alunos,
// frequência (presente, ausente, sem registro) e remoção em cascata.
import { afterAll, beforeAll, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookieAdmin = "";
let cookieCoordenacao = "";
let serieId = "";
let turmaId = "";
const alunos: string[] = [];
let alunoInativo = "";
let alunoDesistente = "";
const provasCriadas: string[] = [];

interface Prova {
  id: string;
  nome: string;
  local: string | null;
  latitude: number | null;
  longitude: number | null;
  dia: string;
  total: number;
  presentes: number;
  ausentes: number;
}

interface Participante {
  alunoId: string;
  nome: string;
  presente: boolean | null;
}

async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await fetch(`${url}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(resposta.status).toBe(200);
  return resposta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

function chamar(caminho: string, metodo: string, cookie: string, corpo?: unknown, origem = url) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: cookie, Origin: origem, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function criar(corpo: unknown, cookie = cookieCoordenacao): Promise<Prova> {
  const resposta = await chamar("/api/provas", "POST", cookie, corpo);
  expect(resposta.status).toBe(201);
  const prova = ((await resposta.json()) as { prova: Prova }).prova;
  provasCriadas.push(prova.id);
  return prova;
}

async function ler(id: string): Promise<{ prova: Prova; participantes: Participante[] }> {
  const resposta = await chamar(`/api/provas/${id}`, "GET", cookieCoordenacao);
  expect(resposta.status).toBe(200);
  return (await resposta.json()) as { prova: Prova; participantes: Participante[] };
}

beforeAll(async () => {
  await banco.connect();
  cookieAdmin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  cookieCoordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  serieId =
    (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ('QA Provas Especificas', 93) returning id",
      )
    ).rows[0]?.id ?? "";
  turmaId =
    (
      await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ('A', $1) returning id",
        [serieId],
      )
    ).rows[0]?.id ?? "";
  for (const [indice, nome] of ["QA Beatriz", "QA Caio", "QA Ana"].entries()) {
    alunos.push(
      (
        await banco.query<{ id: string }>(
          "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3) returning id",
          [nome, turmaId, indice + 1],
        )
      ).rows[0]?.id ?? "",
    );
  }
  alunoInativo =
    (
      await banco.query<{ id: string }>(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('QA Inativo', $1, $1, 4, false) returning id",
        [turmaId],
      )
    ).rows[0]?.id ?? "";
  alunoDesistente =
    (
      await banco.query<{ id: string }>(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, desistente_em) values ('QA Desistente', $1, $1, 5, true, current_date - 10) returning id",
        [turmaId],
      )
    ).rows[0]?.id ?? "";
});

afterAll(async () => {
  await banco.query("delete from provas_especificas where id = any($1::uuid[])", [provasCriadas]);
  await banco.query("delete from alunos where turma_id = $1", [turmaId]);
  await banco.query("delete from turmas where id = $1", [turmaId]);
  await banco.query("delete from series where id = $1", [serieId]);
  await banco.end();
});

it("recusa sem sessão e de origem desconhecida", async () => {
  expect((await fetch(`${url}/api/provas`)).status).toBe(401);
  expect((await chamar("/api/provas", "POST", "", { nome: "QA", dia: "2026-11-08" })).status).toBe(
    401,
  );
  const origemInvalida = await chamar(
    "/api/provas",
    "POST",
    cookieAdmin,
    { nome: "QA", dia: "2026-11-08" },
    "https://origem-invalida.exemplo",
  );
  expect(origemInvalida.status).toBe(403);
});

it("recusa origem inválida nas demais escritas e registra a auditoria de cada uma", async () => {
  const prova = await criar({ nome: "QA Origem", dia: "2026-11-30" });
  const caminho = `/api/provas/${prova.id}`;
  const origemInvalida = "https://origem-invalida.exemplo";

  const patch = await chamar(
    caminho,
    "PATCH",
    cookieCoordenacao,
    { nome: "QA Origem 2", dia: "2026-11-30" },
    origemInvalida,
  );
  expect(patch.status).toBe(403);
  const remocao = await chamar(caminho, "DELETE", cookieCoordenacao, undefined, origemInvalida);
  expect(remocao.status).toBe(403);
  const participantes = await chamar(
    `${caminho}/participantes`,
    "PUT",
    cookieCoordenacao,
    { alunoIds: [alunos[0]] },
    origemInvalida,
  );
  expect(participantes.status).toBe(403);
  const frequencia = await chamar(
    `${caminho}/frequencia`,
    "PUT",
    cookieCoordenacao,
    { marcas: [{ alunoId: alunos[0], presente: true }] },
    origemInvalida,
  );
  expect(frequencia.status).toBe(403);

  expect(
    (
      await chamar(`${caminho}/participantes`, "PUT", cookieCoordenacao, {
        alunoIds: [alunos[0]],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await chamar(`${caminho}/frequencia`, "PUT", cookieCoordenacao, {
        marcas: [{ alunoId: alunos[0], presente: true }],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await chamar(caminho, "PATCH", cookieCoordenacao, {
        nome: "QA Origem 2",
        dia: "2026-11-30",
      })
    ).status,
  ).toBe(200);
  expect((await chamar(caminho, "DELETE", cookieCoordenacao)).status).toBe(200);

  const auditoria = await banco.query<{ acao: string }>(
    "select acao from auditoria where alvo = $1 or alvo like $2 order by criado_em",
    [`prova:${prova.id}`, `prova:${prova.id}:%`],
  );
  expect(auditoria.rows.map((linha) => linha.acao)).toEqual([
    "prova-especifica.criar",
    "prova-especifica.participantes",
    "prova-especifica.frequencia",
    "prova-especifica.editar",
    "prova-especifica.remover",
  ]);
});

it.each([
  ["sem nome", { nome: "  ", dia: "2026-11-08" }, "Informe o nome da prova."],
  ["data inexistente", { nome: "QA Enem", dia: "2026-02-30" }, "Data da prova inválida."],
  ["sem data", { nome: "QA Enem" }, "Informe a data da prova."],
  ["campo desconhecido", { nome: "QA Enem", dia: "2026-11-08", x: 1 }, ""],
])("recusa o cadastro %s com 400", async (_rotulo, corpo, mensagem) => {
  const resposta = await chamar("/api/provas", "POST", cookieCoordenacao, corpo);
  expect(resposta.status).toBe(400);
  expect(((await resposta.json()) as { error: string }).error).toContain(mensagem);
});

it("a administração e a coordenação cadastram prova, inclusive no domingo e com data passada", async () => {
  const doEnem = await criar({ nome: "  QA Enem  ", local: " Escola Central ", dia: "2026-11-08" });
  expect(doEnem).toMatchObject({ nome: "QA Enem", local: "Escola Central", dia: "2026-11-08" });
  const semLocal = await criar(
    { nome: "QA Vestibular", local: "  ", dia: "2020-12-01" },
    cookieAdmin,
  );
  expect(semLocal.local).toBeNull();
  const resposta = await chamar("/api/provas", "GET", cookieAdmin);
  const ids = new Set([doEnem.id, semLocal.id]);
  const lista = ((await resposta.json()) as { provas: Prova[] }).provas.filter((prova) =>
    ids.has(prova.id),
  );
  expect(lista.map((prova) => prova.nome)).toEqual(["QA Enem", "QA Vestibular"]);
});

it("grava as coordenadas do mapa arredondadas, recusa par incompleto e fora da faixa e permite limpar", async () => {
  const prova = await criar({
    nome: "QA Mapa",
    local: "Escola Central",
    latitude: -3.731912345678,
    longitude: -38.526687654321,
    dia: "2026-11-15",
  });
  expect(prova).toMatchObject({ latitude: -3.731912, longitude: -38.526688 });
  expect((await ler(prova.id)).prova).toMatchObject({ latitude: -3.731912, longitude: -38.526688 });

  const casos: Array<[string, Record<string, unknown>, string]> = [
    ["só a latitude", { latitude: -3.7 }, "Informe a latitude e a longitude juntas."],
    ["só a longitude", { longitude: -38.5 }, "Informe a latitude e a longitude juntas."],
    [
      "latitude fora da faixa",
      { latitude: 91, longitude: 0 },
      "A latitude deve ficar entre -90 e 90.",
    ],
    [
      "longitude fora da faixa",
      { latitude: 0, longitude: -181 },
      "A longitude deve ficar entre -180 e 180.",
    ],
    ["latitude em texto", { latitude: "-3.7", longitude: -38.5 }, "Latitude inválida."],
  ];
  for (const [, coordenadas, mensagem] of casos) {
    const resposta = await chamar("/api/provas", "POST", cookieCoordenacao, {
      nome: "QA Mapa inválido",
      dia: "2026-11-15",
      ...coordenadas,
    });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { error: string }).error).toBe(mensagem);
  }

  const zero = await chamar(`/api/provas/${prova.id}`, "PATCH", cookieCoordenacao, {
    nome: "QA Mapa",
    dia: "2026-11-15",
    latitude: 0,
    longitude: 0,
  });
  expect(((await zero.json()) as { prova: Prova }).prova).toMatchObject({
    latitude: 0,
    longitude: 0,
  });

  const limpa = await chamar(`/api/provas/${prova.id}`, "PATCH", cookieCoordenacao, {
    nome: "QA Mapa",
    dia: "2026-11-15",
  });
  expect(((await limpa.json()) as { prova: Prova }).prova).toMatchObject({
    latitude: null,
    longitude: null,
  });
  const lista = (
    (await (await chamar("/api/provas", "GET", cookieCoordenacao)).json()) as { provas: Prova[] }
  ).provas.find((item) => item.id === prova.id);
  expect(lista).toMatchObject({ latitude: null, longitude: null });
});

it("soma os alunos distintos das provas a até 100 m do ponto e ignora as de longe e as sem local", async () => {
  const ponto = { latitude: -3.7319, longitude: -38.5267 };
  const aoLado = { latitude: ponto.latitude + 0.0002, longitude: ponto.longitude }; // cerca de 22 m
  const longe = { latitude: ponto.latitude + 0.01, longitude: ponto.longitude }; // cerca de 1,1 km
  const margem = { latitude: ponto.latitude + 0.00135, longitude: ponto.longitude }; // cerca de 150 m
  const dani = (
    await banco.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ('QA Dani', $1, $1, 8) returning id",
      [turmaId],
    )
  ).rows[0]?.id;
  const inscrever = (id: string, alunoIds: Array<string | undefined>) =>
    chamar(`/api/provas/${id}/participantes`, "PUT", cookieCoordenacao, { alunoIds });

  const a = await criar({ nome: "QA Local A", dia: "2026-11-20", ...ponto });
  const b = await criar({ nome: "QA Local B", dia: "2026-11-21", ...aoLado });
  const c = await criar({ nome: "QA Local C", dia: "2026-11-22", ...longe });
  const g = await criar({ nome: "QA Local G", dia: "2026-11-23", ...margem });
  const semLocal = await criar({ nome: "QA Local sem ponto", dia: "2026-11-24" });
  await inscrever(a.id, [alunos[0], alunos[1]]);
  await inscrever(b.id, [alunos[1], alunos[2]]); // alunos[1] repete: conta uma vez
  await inscrever(c.id, [dani]);
  await inscrever(g.id, [alunos[0]]);
  await inscrever(semLocal.id, [alunos[2]]);

  interface Ocupacao {
    alunos: number;
    provas: Array<{ id: string; nome: string; dia: string; alunos: number; atual: boolean }>;
  }
  const consultar = async (parametros: string, cookie = cookieCoordenacao) => {
    const resposta = await chamar(`/api/provas/ocupacao?${parametros}`, "GET", cookie);
    return {
      status: resposta.status,
      corpo: (await resposta.json()) as Ocupacao & { error: string },
    };
  };
  const doPonto = `latitude=${ponto.latitude}&longitude=${ponto.longitude}`;

  const noPonto = await consultar(doPonto);
  expect(noPonto.status).toBe(200);
  expect(noPonto.corpo.alunos).toBe(3);
  expect(noPonto.corpo.provas.filter((p) => p.nome.startsWith("QA Local"))).toEqual([
    { id: b.id, nome: "QA Local B", dia: "2026-11-21", alunos: 2, atual: false },
    { id: a.id, nome: "QA Local A", dia: "2026-11-20", alunos: 2, atual: false },
  ]);

  // Vírgula decimal e a administração valem como no restante da API.
  const comVirgula = await consultar(
    `latitude=${String(ponto.latitude).replace(".", ",")}&longitude=${String(ponto.longitude).replace(".", ",")}`,
    cookieAdmin,
  );
  expect(comVirgula.corpo.alunos).toBe(3);

  // A prova em edição entra com os próprios alunos, mesmo marcada em outro ponto.
  const comAtual = await consultar(`${doPonto}&provaId=${c.id}`);
  expect(comAtual.corpo.alunos).toBe(4);
  expect(comAtual.corpo.provas.find((p) => p.id === c.id)).toMatchObject({
    atual: true,
    alunos: 1,
  });

  // A prova em edição que já está no ponto não é contada duas vezes.
  const jaNoPonto = await consultar(`${doPonto}&provaId=${a.id}`);
  expect(jaNoPonto.corpo.alunos).toBe(3);
  expect(jaNoPonto.corpo.provas.filter((p) => p.id === a.id)).toHaveLength(1);

  // Longe de todas, a ocupação é zero.
  const vazio = await consultar(`latitude=${ponto.latitude - 0.01}&longitude=${ponto.longitude}`);
  expect(vazio.corpo).toMatchObject({ alunos: 0 });
  expect(vazio.corpo.provas.filter((p) => p.nome.startsWith("QA Local"))).toEqual([]);

  // Validação e acesso.
  const faltando = await consultar("latitude=-3.7");
  expect(faltando.status).toBe(400);
  expect(faltando.corpo.error).toBe("Informe a latitude e a longitude.");
  expect((await consultar("latitude=95&longitude=0")).corpo.error).toBe(
    "A latitude deve ficar entre -90 e 90.",
  );
  expect((await consultar("latitude=abc&longitude=0")).status).toBe(400);
  expect((await consultar(`${doPonto}&provaId=nao-e-uuid`)).corpo.error).toBe("Prova inválida.");
  expect((await consultar(doPonto, "")).status).toBe(401);
});

it("o banco recusa coordenadas incompletas ou fora da faixa mesmo sem passar pela API", async () => {
  const inserir = (latitude: number | null, longitude: number | null) =>
    banco.query(
      "insert into provas_especificas (nome, dia, latitude, longitude, atualizado_em) values ('QA Banco', '2026-11-16', $1, $2, now())",
      [latitude, longitude],
    );
  await expect(inserir(10, null)).rejects.toThrow(/provas_especificas_coordenadas_ck/);
  await expect(inserir(null, 10)).rejects.toThrow(/provas_especificas_coordenadas_ck/);
  await expect(inserir(91, 0)).rejects.toThrow(/provas_especificas_coordenadas_ck/);
  await expect(inserir(0, 181)).rejects.toThrow(/provas_especificas_coordenadas_ck/);
  await inserir(-3.7319, -38.5267);
  await banco.query("delete from provas_especificas where nome = 'QA Banco'");
});

it("inscreve alunos, mantém marcas ao reenviar a lista e recusa aluno inativo ou desconhecido", async () => {
  const prova = await criar({ nome: "QA Inscrição", dia: "2026-11-09" });
  const caminho = `/api/provas/${prova.id}/participantes`;

  const inscrita = await chamar(caminho, "PUT", cookieCoordenacao, {
    alunoIds: [alunos[0], alunos[1]],
  });
  expect(inscrita.status).toBe(200);
  const aposInscrever = (await inscrita.json()) as { participantes: Participante[] };
  expect(aposInscrever.participantes.map((p) => p.nome)).toEqual(["QA Beatriz", "QA Caio"]);

  await chamar(`/api/provas/${prova.id}/frequencia`, "PUT", cookieCoordenacao, {
    marcas: [{ alunoId: alunos[0], presente: true }],
  });
  const troca = await chamar(caminho, "PUT", cookieCoordenacao, {
    alunoIds: [alunos[0], alunos[2]],
  });
  expect(troca.status).toBe(200);
  const aposTroca = (await troca.json()) as { participantes: Participante[] };
  expect(aposTroca.participantes).toEqual([
    expect.objectContaining({ nome: "QA Ana", presente: null }),
    expect.objectContaining({ nome: "QA Beatriz", presente: true }),
  ]);

  const inativo = await chamar(caminho, "PUT", cookieCoordenacao, { alunoIds: [alunoInativo] });
  expect(inativo.status).toBe(400);
  const desistente = await chamar(caminho, "PUT", cookieCoordenacao, {
    alunoIds: [alunoDesistente],
  });
  expect(desistente.status).toBe(400);
  const inexistente = await chamar(caminho, "PUT", cookieCoordenacao, {
    alunoIds: ["00000000-0000-4000-8000-000000000000"],
  });
  expect(inexistente.status).toBe(400);
  const repetidos = await chamar(caminho, "PUT", cookieCoordenacao, {
    alunoIds: [alunos[0], alunos[0]],
  });
  expect(repetidos.status).toBe(400);
  expect((await ler(prova.id)).participantes).toHaveLength(2);
});

it("registra presente, ausente e sem registro, recusa quem não está inscrito e conta na lista", async () => {
  const prova = await criar({ nome: "QA Frequência", local: "Sala 3", dia: "2026-11-10" });
  await chamar(`/api/provas/${prova.id}/participantes`, "PUT", cookieCoordenacao, {
    alunoIds: alunos,
  });
  const caminho = `/api/provas/${prova.id}/frequencia`;

  const marcada = await chamar(caminho, "PUT", cookieCoordenacao, {
    marcas: [
      { alunoId: alunos[0], presente: true },
      { alunoId: alunos[1], presente: false },
    ],
  });
  expect(marcada.status).toBe(200);
  expect(((await marcada.json()) as { prova: Prova }).prova).toMatchObject({
    total: 3,
    presentes: 1,
    ausentes: 1,
  });

  const desfeita = await chamar(caminho, "PUT", cookieAdmin, {
    marcas: [{ alunoId: alunos[1], presente: null }],
  });
  expect(((await desfeita.json()) as { prova: Prova }).prova).toMatchObject({
    presentes: 1,
    ausentes: 0,
  });

  const forasteiro = await chamar(caminho, "PUT", cookieCoordenacao, {
    marcas: [{ alunoId: alunoInativo, presente: true }],
  });
  expect(forasteiro.status).toBe(400);
  const semMarcas = await chamar(caminho, "PUT", cookieCoordenacao, { marcas: [] });
  expect(semMarcas.status).toBe(400);

  const lista = (
    (await (await chamar("/api/provas", "GET", cookieCoordenacao)).json()) as { provas: Prova[] }
  ).provas.find((item) => item.id === prova.id);
  expect(lista).toMatchObject({ total: 3, presentes: 1, ausentes: 0 });
});

it("edita nome, local e data sem perder alunos nem marcas", async () => {
  const prova = await criar({ nome: "QA Edição", dia: "2026-11-11" });
  await chamar(`/api/provas/${prova.id}/participantes`, "PUT", cookieCoordenacao, {
    alunoIds: [alunos[0]],
  });
  await chamar(`/api/provas/${prova.id}/frequencia`, "PUT", cookieCoordenacao, {
    marcas: [{ alunoId: alunos[0], presente: false }],
  });
  const resposta = await chamar(`/api/provas/${prova.id}`, "PATCH", cookieCoordenacao, {
    nome: "QA Edição 2",
    local: "Auditório",
    dia: "2026-11-12",
  });
  expect(resposta.status).toBe(200);
  const dados = (await resposta.json()) as { prova: Prova; participantes: Participante[] };
  expect(dados.prova).toMatchObject({ nome: "QA Edição 2", local: "Auditório", dia: "2026-11-12" });
  expect(dados.participantes).toEqual([expect.objectContaining({ presente: false })]);
});

it("remove a prova com as inscrições e responde 404 para prova inexistente ou id inválido", async () => {
  const prova = await criar({ nome: "QA Remoção", dia: "2026-11-13" });
  await chamar(`/api/provas/${prova.id}/participantes`, "PUT", cookieCoordenacao, {
    alunoIds: [alunos[0]],
  });
  expect((await chamar(`/api/provas/${prova.id}`, "DELETE", cookieAdmin)).status).toBe(200);
  expect((await chamar(`/api/provas/${prova.id}`, "GET", cookieCoordenacao)).status).toBe(404);
  expect((await chamar(`/api/provas/${prova.id}`, "DELETE", cookieAdmin)).status).toBe(404);
  expect((await chamar("/api/provas/nao-e-uuid", "GET", cookieAdmin)).status).toBe(404);
  const restantes = await banco.query("select 1 from participantes_prova where prova_id = $1", [
    prova.id,
  ]);
  expect(restantes.rowCount).toBe(0);
});

it("excluir o aluno remove a inscrição dele nas provas", async () => {
  const prova = await criar({ nome: "QA Aluno excluído", dia: "2026-11-14" });
  const temporario = (
    await banco.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ('QA Temporário', $1, $1, 9) returning id",
      [turmaId],
    )
  ).rows[0]?.id;
  await chamar(`/api/provas/${prova.id}/participantes`, "PUT", cookieCoordenacao, {
    alunoIds: [temporario],
  });
  expect((await ler(prova.id)).prova.total).toBe(1);
  await banco.query("delete from alunos where id = $1", [temporario]);
  expect((await ler(prova.id)).prova.total).toBe(0);
});
