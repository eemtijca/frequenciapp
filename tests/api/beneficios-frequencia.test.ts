// Contrato das regras de frequência dos benefícios e dos alertas do mês: o limite vem da configuração, não do código.
import { afterAll, beforeAll, expect, it } from "vitest";
import pg from "pg";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookieAdmin = "";
let cookieCoordenacao = "";
let serieId = "";
let turmaId = "";
let alunoId = "";
let alunoSoJustificadasId = "";

interface Beneficio {
  id: string;
  nome: string;
  percentualMinimoFrequencia: number;
  aulasPorDia: number | null;
  faltasJustificadasContam: boolean;
  ativo: boolean;
}

interface Alerta {
  beneficioId: string;
  beneficioNome: string;
  percentualMinimoFrequencia: number;
  aulasPorDia: number | null;
  faltasJustificadasContam: boolean;
  alunoId: string;
  aulasFaltadas: number;
  aulasJustificadas: number;
  horasLetivas: number;
  limiteFaltas: number;
  diasLetivos: number;
  aulasDeReferencia: number | null;
}

// Junho de 2026 tem 22 dias úteis; com uma aula por dia, o mês passa de 20 aulas.
const DIAS = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-05", "2026-06-08", "2026-06-09"];

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

function enviar(metodo: string, caminho: string, cookie: string, corpo?: unknown) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: cookie, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

async function criarBeneficio(corpo: unknown): Promise<Beneficio> {
  const resposta = await enviar("POST", "/api/beneficios-frequencia", cookieAdmin, corpo);
  expect(resposta.status).toBe(201);
  return ((await resposta.json()) as { beneficio: Beneficio }).beneficio;
}

async function alertasDe(beneficioId: string, alvo = alunoId): Promise<Alerta[]> {
  const resposta = await fetch(`${url}/api/frequencias/alertas-beneficios?mes=2026-06`, {
    headers: { Cookie: cookieAdmin },
  });
  expect(resposta.status).toBe(200);
  const dados = (await resposta.json()) as { alertas: Alerta[] };
  return dados.alertas.filter((a) => a.beneficioId === beneficioId && a.alunoId === alvo);
}

beforeAll(async () => {
  await banco.connect();
  cookieAdmin = await entrar("direcao@escola.exemplo", "DirecaoFrequencia2026");
  cookieCoordenacao = await entrar("demo@escola.exemplo", "DemoFrequencia2026");
  serieId =
    (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ('QA Beneficios', 96) returning id",
      )
    ).rows[0]?.id ?? "";
  turmaId =
    (
      await banco.query<{ id: string }>(
        "insert into turmas (nome,serie_id) values ('A',$1) returning id",
        [serieId],
      )
    ).rows[0]?.id ?? "";
  const criarAluno = async (nome: string, ordem: number) =>
    (
      await banco.query<{ id: string }>(
        "insert into alunos (nome,turma_id,turma_original_id,ordem) values ($1,$2,$2,$3) returning id",
        [nome, turmaId, ordem],
      )
    ).rows[0]?.id ?? "";
  alunoId = await criarAluno("QA Beneficios Aluno", 1);
  alunoSoJustificadasId = await criarAluno("QA Beneficios So Justificadas", 2);
  await banco.query(
    "insert into horarios (turma_id,ordem,inicio,fim,dias_semana) values ($1,1,'07:00','07:50',array[1,2,3,4,5,6])",
    [turmaId],
  );
  for (const dia of DIAS) {
    const salvo = await enviar("POST", "/api/frequencias", cookieCoordenacao, {
      dia,
      turmaId,
      revisao: 0,
      faltas: [
        // Uma falta justificada e cinco sem justificativa.
        { alunoId, justificativa: dia === DIAS[0] ? "O" : null },
        { alunoId: alunoSoJustificadasId, justificativa: "O" },
      ],
    });
    expect(salvo.status).toBe(200);
  }
});

afterAll(async () => {
  await banco.query("delete from beneficios_frequencia where nome like 'QA Beneficio%'");
  await banco.query("delete from frequencias where turma_id = $1", [turmaId]);
  await banco.query("delete from alunos where turma_id = $1", [turmaId]);
  await banco.query("delete from turmas where id = $1", [turmaId]);
  await banco.query("delete from series where id = $1", [serieId]);
  await banco.end();
});

it("a migração deixa uma regra inicial editável, sem nome fixo no código", async () => {
  const resposta = await fetch(`${url}/api/beneficios-frequencia`, {
    headers: { Cookie: cookieCoordenacao },
  });
  expect(resposta.status).toBe(200);
  const { beneficios } = (await resposta.json()) as { beneficios: Beneficio[] };
  expect(beneficios.length).toBeGreaterThan(0);
  expect(beneficios.every((b) => b.percentualMinimoFrequencia >= 1)).toBe(true);
});

it("cria, lista, edita e exclui um benefício, só pela administração", async () => {
  const criado = await criarBeneficio({
    nome: "QA Beneficio Crud",
    percentualMinimoFrequencia: 85,
    aulasPorDia: null,
  });
  expect(criado).toMatchObject({
    nome: "QA Beneficio Crud",
    percentualMinimoFrequencia: 85,
    faltasJustificadasContam: false,
    ativo: true,
  });

  const lista = await fetch(`${url}/api/beneficios-frequencia`, {
    headers: { Cookie: cookieCoordenacao },
  });
  expect(
    ((await lista.json()) as { beneficios: Beneficio[] }).beneficios.map((b) => b.id),
  ).toContain(criado.id);

  expect(
    (
      await enviar("POST", "/api/beneficios-frequencia", cookieCoordenacao, {
        nome: "QA Beneficio Coord",
        percentualMinimoFrequencia: 80,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await enviar("PATCH", `/api/beneficios-frequencia/${criado.id}`, cookieCoordenacao, {
        ativo: false,
      })
    ).status,
  ).toBe(403);

  const editado = await enviar("PATCH", `/api/beneficios-frequencia/${criado.id}`, cookieAdmin, {
    percentualMinimoFrequencia: 70,
    faltasJustificadasContam: true,
    ativo: false,
  });
  expect(editado.status).toBe(200);
  expect(((await editado.json()) as { beneficio: Beneficio }).beneficio).toMatchObject({
    percentualMinimoFrequencia: 70,
    faltasJustificadasContam: true,
    ativo: false,
  });

  expect(
    (await enviar("DELETE", `/api/beneficios-frequencia/${criado.id}`, cookieAdmin)).status,
  ).toBe(200);
  expect(
    (await enviar("DELETE", `/api/beneficios-frequencia/${criado.id}`, cookieAdmin)).status,
  ).toBe(404);
});

it.each([
  ["percentual zero", { nome: "QA Beneficio Zero", percentualMinimoFrequencia: 0 }],
  ["percentual acima de 100", { nome: "QA Beneficio Cem", percentualMinimoFrequencia: 101 }],
  ["percentual fracionado", { nome: "QA Beneficio Frac", percentualMinimoFrequencia: 80.5 }],
  ["percentual em texto", { nome: "QA Beneficio Texto", percentualMinimoFrequencia: "80" }],
  ["sem percentual", { nome: "QA Beneficio Sem" }],
  ["nome curto", { nome: "A", percentualMinimoFrequencia: 80 }],
  ["sem nome", { percentualMinimoFrequencia: 80 }],
])("recusa benefício inválido: %s", async (_motivo, corpo) => {
  expect((await enviar("POST", "/api/beneficios-frequencia", cookieAdmin, corpo)).status).toBe(400);
});

it("recusa nome repetido sem diferenciar caixa e id inválido", async () => {
  const criado = await criarBeneficio({
    nome: "QA Beneficio Duplicado",
    percentualMinimoFrequencia: 80,
  });
  const repetido = await enviar("POST", "/api/beneficios-frequencia", cookieAdmin, {
    nome: "qa beneficio duplicado",
    percentualMinimoFrequencia: 60,
  });
  expect(repetido.status).toBe(409);
  expect(
    (await enviar("PATCH", "/api/beneficios-frequencia/nao-e-uuid", cookieAdmin, { ativo: false }))
      .status,
  ).toBe(400);
  expect(
    (
      await enviar(
        "PATCH",
        "/api/beneficios-frequencia/00000000-0000-4000-8000-000000000000",
        cookieAdmin,
        { ativo: false },
      )
    ).status,
  ).toBe(404);
  expect(
    (await enviar("PATCH", `/api/beneficios-frequencia/${criado.id}`, cookieAdmin, {})).status,
  ).toBe(400);
});

it("mudar o percentual pela API muda o limite e o alerta na mesma proporção", async () => {
  const beneficio = await criarBeneficio({
    nome: "QA Beneficio Percentual",
    percentualMinimoFrequencia: 80,
  });
  const [a80] = await alertasDe(beneficio.id);
  // O aluno tem 5 faltas sem justificativa; com 80% o limite fica abaixo disso.
  expect(a80).toBeDefined();
  const horas = a80?.horasLetivas ?? 0;
  expect(horas).toBeGreaterThan(0);
  expect(a80?.aulasFaltadas).toBe(5);
  expect(a80?.limiteFaltas).toBe(Math.floor((horas * 20) / 100));
  expect(a80?.percentualMinimoFrequencia).toBe(80);

  const atualizar = (percentualMinimoFrequencia: number) =>
    enviar("PATCH", `/api/beneficios-frequencia/${beneficio.id}`, cookieAdmin, {
      percentualMinimoFrequencia,
    });

  // Com 50% o limite sobe e as 5 faltas deixam de passar dele.
  expect((await atualizar(50)).status).toBe(200);
  expect(await alertasDe(beneficio.id)).toEqual([]);

  // Com 100% nenhuma falta é permitida: o limite é zero e o alerta volta.
  expect((await atualizar(100)).status).toBe(200);
  const [a100] = await alertasDe(beneficio.id);
  expect(a100?.limiteFaltas).toBe(0);
  expect(a100?.horasLetivas).toBe(horas);

  // Com 90% o limite é o inteiro de 10% das aulas do mês.
  expect((await atualizar(90)).status).toBe(200);
  const [a90] = await alertasDe(beneficio.id);
  expect(a90?.limiteFaltas).toBe(Math.floor((horas * 10) / 100));
});

it("um segundo benefício com regra distinta é calculado com a própria configuração", async () => {
  const semJustificadas = await criarBeneficio({
    nome: "QA Beneficio A",
    percentualMinimoFrequencia: 80,
    faltasJustificadasContam: false,
  });
  const comJustificadas = await criarBeneficio({
    nome: "QA Beneficio B",
    percentualMinimoFrequencia: 90,
    faltasJustificadasContam: true,
  });

  const [a] = await alertasDe(semJustificadas.id);
  const [b] = await alertasDe(comJustificadas.id);
  expect(a).toMatchObject({
    beneficioNome: "QA Beneficio A",
    faltasJustificadasContam: false,
    aulasFaltadas: 5,
    aulasJustificadas: 1,
    percentualMinimoFrequencia: 80,
  });
  expect(b).toMatchObject({
    beneficioNome: "QA Beneficio B",
    faltasJustificadasContam: true,
    aulasFaltadas: 6,
    aulasJustificadas: 1,
    percentualMinimoFrequencia: 90,
  });
  expect(b?.limiteFaltas).toBe(Math.floor(((b?.horasLetivas ?? 0) * 10) / 100));
  expect(a?.limiteFaltas).toBe(Math.floor(((a?.horasLetivas ?? 0) * 20) / 100));

  // O aluno só com justificadas passa no benefício A e só aparece no B, que as conta.
  expect(await alertasDe(semJustificadas.id, alunoSoJustificadasId)).toEqual([]);
  const [soJustificadas] = await alertasDe(comJustificadas.id, alunoSoJustificadasId);
  expect(soJustificadas?.aulasFaltadas).toBe(6);
});

it("benefício inativo não gera alerta e volta a gerar quando é reativado", async () => {
  const beneficio = await criarBeneficio({
    nome: "QA Beneficio Situacao",
    percentualMinimoFrequencia: 100,
  });
  expect(await alertasDe(beneficio.id)).toHaveLength(1);
  await enviar("PATCH", `/api/beneficios-frequencia/${beneficio.id}`, cookieAdmin, {
    ativo: false,
  });
  expect(await alertasDe(beneficio.id)).toEqual([]);
  await enviar("PATCH", `/api/beneficios-frequencia/${beneficio.id}`, cookieAdmin, { ativo: true });
  expect(await alertasDe(beneficio.id)).toHaveLength(1);
});

it("mantém o limite ao consultar chamadas antigas sem retrato de aulas", async () => {
  const beneficio = await criarBeneficio({
    nome: "QA Beneficio Sem Retrato",
    percentualMinimoFrequencia: 80,
  });
  const antes = await alertasDe(beneficio.id);
  expect(antes[0]).toMatchObject({ horasLetivas: 22, limiteFaltas: 4, aulasFaltadas: 5 });
  try {
    await banco.query(
      "delete from aulas_chamada a using frequencias f where a.frequencia_id=f.id and f.turma_id=$1",
      [turmaId],
    );
    expect(await alertasDe(beneficio.id)).toEqual(antes);
  } finally {
    await banco.query(
      "insert into aulas_chamada (frequencia_id,horario_id) select f.id,h.id from frequencias f join horarios h on h.turma_id=f.turma_id where f.turma_id=$1 on conflict do nothing",
      [turmaId],
    );
  }
});

it("salva a carga diária pela Gestão, mantém os retratos e permite voltar à grade", async () => {
  const beneficio = await criarBeneficio({
    nome: "QA Beneficio Carga Diaria",
    percentualMinimoFrequencia: 99,
    aulasPorDia: 9,
  });
  expect(beneficio.aulasPorDia).toBe(9);
  expect((await alertasDe(beneficio.id))[0]).toMatchObject({
    aulasPorDia: 9,
    horasLetivas: 150,
    limiteFaltas: 1,
    aulasFaltadas: 5,
  });
  const editar = (cookie: string, corpo: unknown) =>
    enviar("PATCH", `/api/beneficios-frequencia/${beneficio.id}`, cookie, corpo);
  expect((await editar(cookieCoordenacao, { aulasPorDia: 8 })).status).toBe(403);
  expect((await editar(cookieAdmin, { nome: "QA Beneficio Carga Renomeada" })).status).toBe(200);
  const lista = await enviar("GET", "/api/beneficios-frequencia", cookieAdmin);
  const dados = (await lista.json()) as { beneficios: Beneficio[] };
  expect(dados.beneficios.find((item) => item.id === beneficio.id)?.aulasPorDia).toBe(9);
  expect((await editar(cookieAdmin, { aulasPorDia: null })).status).toBe(200);
  expect((await alertasDe(beneficio.id))[0]).toMatchObject({
    aulasPorDia: null,
    horasLetivas: 22,
    limiteFaltas: 0,
  });
});

it.each([0, 31, 9.5, "9", false])("recusa carga diária inválida: %s", async (aulasPorDia) => {
  const criar = await enviar("POST", "/api/beneficios-frequencia", cookieAdmin, {
    nome: "QA Beneficio Carga Invalida",
    percentualMinimoFrequencia: 80,
    aulasPorDia,
  });
  expect(criar.status).toBe(400);
});

it("distingue dias de falta do resumo e aulas perdidas do alerta, preservando o retrato", async () => {
  const turma = (
    await banco.query<{ id: string }>(
      "insert into turmas (nome,serie_id) values ('B',$1) returning id",
      [serieId],
    )
  ).rows[0]?.id;
  try {
    const aluno =
      (
        await banco.query<{ id: string }>(
          "insert into alunos (nome,turma_id,turma_original_id,ordem) values ('QA Beneficios Aulas',$1,$1,1) returning id",
          [turma],
        )
      ).rows[0]?.id ?? "";
    const horarios = (
      await banco.query<{ id: string }>(
        "insert into horarios (turma_id,ordem,inicio,fim,dias_semana) select $1,n,'07:00','07:50',array[1,2,3,4,5] from generate_series(1,7) n returning id",
        [turma],
      )
    ).rows;
    const beneficio = await criarBeneficio({
      nome: "QA Beneficio Por Aula",
      percentualMinimoFrequencia: 90,
    });
    for (const [indice, dia] of DIAS.entries()) {
      const salvo = await enviar("POST", "/api/frequencias", cookieCoordenacao, {
        dia,
        turmaId: turma,
        revisao: 0,
        faltas: [
          indice < 4
            ? { alunoId: aluno }
            : { alunoId: aluno, horarios: [horarios[0]?.id], justificativa: "O" },
        ],
      });
      expect(salvo.status).toBe(200);
    }
    const resumo = await enviar(
      "GET",
      "/api/frequencias/resumo?de=2026-06-01&ate=2026-06-30",
      cookieAdmin,
    );
    const dados = (await resumo.json()) as {
      resumo: { porAluno: { alunoId: string; faltas: number; faltasJustificadas: number }[] };
    };
    expect(dados.resumo.porAluno.find((item) => item.alunoId === aluno)).toMatchObject({
      faltas: 4,
      faltasJustificadas: 2,
    });
    expect((await alertasDe(beneficio.id, aluno))[0]).toMatchObject({
      aulasFaltadas: 28,
      aulasJustificadas: 2,
      horasLetivas: 154,
      limiteFaltas: 15,
    });
    // A nova grade muda só a projeção dos 16 dias sem chamada, preservando os seis retratos.
    await banco.query("update horarios set ativo=false where turma_id=$1 and ordem>5", [turma]);
    expect((await alertasDe(beneficio.id, aluno))[0]).toMatchObject({
      aulasFaltadas: 28,
      aulasJustificadas: 2,
      horasLetivas: 122,
      limiteFaltas: 12,
    });
  } finally {
    await banco.query("delete from frequencias where turma_id=$1", [turma]);
    await banco.query("delete from alunos where turma_id=$1", [turma]);
    await banco.query("delete from turmas where id=$1", [turma]);
  }
});

it.each(["", "mes=", "mes=2026-13", "mes=2026-6", "mes=2026-06-01"])(
  "recusa mês inválido nos alertas: %s",
  async (parametros) => {
    const resposta = await fetch(`${url}/api/frequencias/alertas-beneficios?${parametros}`, {
      headers: { Cookie: cookieAdmin },
    });
    expect(resposta.status).toBe(400);
  },
);

it("exige sessão para ler regras e alertas", async () => {
  expect((await fetch(`${url}/api/beneficios-frequencia`)).status).toBe(401);
  expect((await fetch(`${url}/api/frequencias/alertas-beneficios?mes=2026-06`)).status).toBe(401);
});
