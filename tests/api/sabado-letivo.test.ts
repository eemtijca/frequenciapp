// Contratos do sábado letivo excepcional, sem alterar a grade semanal da turma.
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import pg from "pg";
import { diaDaSemanaIso, diaLocal, type Frequencia } from "@/domain/frequencia";
import type { RegistroPersonalizado } from "@/domain/frequencia-personalizada";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = "QA Sabado Letivo";
const justificativa = "QASAB";
const alunos: string[] = [];
const horarios: string[] = [];
const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
const distanciaDoSabado = (diaDaSemanaIso(hoje) - 6 + 7) % 7;
const sabado = deslocarDia(hoje, -distanciaDoSabado - 7);
const sabadoFuturo = deslocarDia(hoje, 7 - distanciaDoSabado);
let turmaId = "";
let outraTurmaId = "";
let aulaInativa = "";
let aulaDeOutraTurma = "";
let cookie = "";

function deslocarDia(dia: string, quantidade: number): string {
  const data = new Date(`${dia}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return data.toISOString().slice(0, 10);
}

function alunoDe(indice: number): string {
  const id = alunos[indice];
  if (!id) throw new Error("Aluno sintético não preparado.");
  return id;
}

function horarioDe(indice: number): string {
  const id = horarios[indice];
  if (!id) throw new Error("Aula sintética não preparada.");
  return id;
}

async function chamar(caminho: string, metodo = "GET", corpo?: unknown, sessao = cookie) {
  return fetch(`${url}${caminho}`, {
    method: metodo,
    headers: { Cookie: sessao, Origin: url, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function dadosDaChamada(alteracoes: Record<string, unknown> = {}) {
  return { dia: sabado, turmaId, faltas: [], revisao: 0, sabadoLetivo: true, ...alteracoes };
}

async function salvar(alteracoes: Record<string, unknown> = {}): Promise<Frequencia> {
  const resposta = await chamar("/api/frequencias", "POST", dadosDaChamada(alteracoes));
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { frequencia: Frequencia }).frequencia;
}

async function consultar(): Promise<Frequencia | null> {
  const resposta = await chamar(`/api/frequencias?dia=${sabado}&turmaId=${turmaId}`);
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { frequencia: Frequencia | null }).frequencia;
}

async function listarPersonalizadas(): Promise<RegistroPersonalizado[]> {
  const resposta = await chamar(`/api/frequencias-personalizadas?dia=${sabado}&turmaId=${turmaId}`);
  expect(resposta.status).toBe(200);
  return ((await resposta.json()) as { registros: RegistroPersonalizado[] }).registros;
}

async function limparChamadas() {
  await banco.query(
    "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
    [prefixo],
  );
}

async function limpar() {
  await limparChamadas();
  await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = $1)",
    [prefixo],
  );
  await banco.query("delete from series where nome = $1", [prefixo]);
  await banco.query("delete from justificativas where codigo = $1", [justificativa]);
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
  const turmas = await banco.query<{ id: string; nome: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A'), ($1, 'B') returning id, nome",
    [serie.rows[0]?.id],
  );
  turmaId = turmas.rows.find((item) => item.nome === "A")?.id ?? "";
  outraTurmaId = turmas.rows.find((item) => item.nome === "B")?.id ?? "";
  for (const [indice, nome] of ["Integral", "Justificada", "Parcial", "Presente"].entries()) {
    const criado = await banco.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3) returning id",
      [`${prefixo} ${nome}`, turmaId, indice + 1],
    );
    const id = criado.rows[0]?.id;
    if (!id) throw new Error("Aluno sintético não preparado.");
    alunos.push(id);
  }
  for (let ordem = 1; ordem <= 3; ordem++) {
    const criado = await banco.query<{ id: string }>(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, $2, '07:00', '07:50', $3, $4) returning id",
      [turmaId, ordem, [1, 2, 3, 4, 5], ordem < 3],
    );
    const id = criado.rows[0]?.id;
    if (!id) throw new Error("Aula sintética não preparada.");
    if (ordem < 3) horarios.push(id);
    else aulaInativa = id;
  }
  const outraAula = await banco.query<{ id: string }>(
    "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2) returning id",
    [outraTurmaId, [1, 2, 3, 4, 5]],
  );
  aulaDeOutraTurma = outraAula.rows[0]?.id ?? "";
  await banco.query("insert into justificativas (codigo, rotulo) values ($1, $2)", [
    justificativa,
    "QA Motivo sábado letivo",
  ]);
});

beforeEach(async () => {
  await limparChamadas();
  await banco.query("update horarios set dias_semana = $1 where turma_id = $2", [
    [1, 2, 3, 4, 5],
    turmaId,
  ]);
});

afterAll(async () => {
  await limpar();
  await banco.end();
});

it("exige sessão e desbloqueio explícito quando o sábado não tem grade", async () => {
  expect((await chamar("/api/frequencias", "POST", dadosDaChamada(), "")).status).toBe(401);
  for (const sabadoLetivo of [undefined, false]) {
    const resposta = await chamar("/api/frequencias", "POST", dadosDaChamada({ sabadoLetivo }));
    expect(resposta.status).toBe(400);
  }
  expect(await consultar()).toBeNull();
});

it("salva faltas integrais e justificadas nas aulas ativas sem modificar a grade semanal", async () => {
  const salva = await salvar({
    faltas: [{ alunoId: alunoDe(0) }, { alunoId: alunoDe(1), justificativa }],
  });
  expect(salva).toMatchObject({ dia: sabado, turmaId, revisao: 1 });
  expect(salva.alunos?.slice().sort()).toEqual(alunos.slice().sort());
  for (const alunoId of [alunoDe(0), alunoDe(1)]) {
    expect(
      salva.faltas
        .find((falta) => falta.alunoId === alunoId)
        ?.horarios?.slice()
        .sort(),
    ).toEqual(horarios.slice().sort());
  }
  expect(salva.faltas.find((falta) => falta.alunoId === alunoDe(1))?.justificativa).toBe(
    justificativa,
  );
  expect(await consultar()).toEqual(salva);
  const grade = await banco.query<{ id: string; dias_semana: number[]; ativo: boolean }>(
    "select id, dias_semana, ativo from horarios where turma_id = $1 order by ordem",
    [turmaId],
  );
  expect(grade.rows.map((aula) => aula.dias_semana)).toEqual([
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
  ]);
  expect(grade.rows.filter((aula) => aula.ativo).map((aula) => aula.id)).toEqual(horarios);
  const personalizada = await listarPersonalizadas();
  expect(personalizada.find((registro) => registro.alunoId === alunoDe(0))).toMatchObject({
    tipo: "CHAMADA",
    marca: "F",
  });
  expect(personalizada.find((registro) => registro.alunoId === alunoDe(1))).toMatchObject({
    tipo: "CHAMADA",
    marca: "FJ",
    justificativas: ["QA Motivo sábado letivo"],
  });
});

it("mantém a falta parcial na Chamada Parcial e a presença implícita dos demais alunos", async () => {
  const salva = await salvar({ faltas: [{ alunoId: alunoDe(2), horarios: [horarioDe(0)] }] });
  expect(salva.faltas).toEqual([{ alunoId: alunoDe(2), horarios: [horarioDe(0)] }]);
  const personalizada = await listarPersonalizadas();
  expect(personalizada).toHaveLength(4);
  expect(personalizada.find((registro) => registro.alunoId === alunoDe(2))).toMatchObject({
    tipo: "CHAMADA",
    marca: "S",
    descricao: "Falta na 1ª aula da Chamada",
  });
  expect(
    personalizada.filter((registro) => registro.tipo === "CHAMADA" && registro.marca === "P"),
  ).toHaveLength(3);
});

it("registra todos presentes mesmo sem faltas para caracterizar o sábado letivo salvo", async () => {
  const salva = await salvar();
  expect(salva.faltas).toEqual([]);
  expect(salva.alunos?.slice().sort()).toEqual(alunos.slice().sort());
  expect(await consultar()).toEqual(salva);
  const personalizada = await listarPersonalizadas();
  expect(personalizada).toHaveLength(4);
  expect(
    personalizada.every((registro) => registro.tipo === "CHAMADA" && registro.marca === "P"),
  ).toBe(true);
});

it("recusa aulas inativas e de outra turma no sábado excepcional", async () => {
  for (const horarioId of [aulaInativa, aulaDeOutraTurma]) {
    const resposta = await chamar(
      "/api/frequencias",
      "POST",
      dadosDaChamada({ faltas: [{ alunoId: alunoDe(0), horarios: [horarioId] }] }),
    );
    expect(resposta.status).toBe(400);
  }
  expect(await consultar()).toBeNull();
});

it("preserva a grade específica do sábado em vez de incluir as aulas dos outros dias", async () => {
  await banco.query("update horarios set dias_semana = $1 where id = $2", [[6], horarioDe(1)]);
  const salva = await salvar({ faltas: [alunoDe(0)], sabadoLetivo: false });
  expect(salva.faltas).toEqual([{ alunoId: alunoDe(0), horarios: [horarioDe(1)] }]);
  const comDesbloqueio = await salvar({ faltas: [alunoDe(0)], revisao: salva.revisao });
  expect(comDesbloqueio.faltas).toEqual(salva.faltas);
  const invalida = await chamar(
    "/api/frequencias",
    "POST",
    dadosDaChamada({
      faltas: [{ alunoId: alunoDe(0), horarios: [horarioDe(0)] }],
      revisao: comDesbloqueio.revisao,
    }),
  );
  expect(invalida.status).toBe(400);
  expect(await consultar()).toEqual(comDesbloqueio);
});

it("conserva as revisões e devolve a versão vigente em alterações concorrentes", async () => {
  const inicial = await salvar({ faltas: [alunoDe(0)] });
  const corrigida = await salvar({ revisao: inicial.revisao, faltas: [alunoDe(1)] });
  expect(corrigida.revisao).toBe(inicial.revisao + 1);
  for (const revisao of [0, inicial.revisao]) {
    const resposta = await chamar(
      "/api/frequencias",
      "POST",
      dadosDaChamada({ revisao, faltas: [] }),
    );
    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toMatchObject({ conflito: true, frequencia: corrigida });
  }
  expect(await consultar()).toEqual(corrigida);
});

it("mantém o bloqueio de datas futuras e restringe o desbloqueio ao sábado", async () => {
  for (const dia of [sabadoFuturo, deslocarDia(sabado, 1), deslocarDia(sabado, 2)]) {
    const resposta = await chamar("/api/frequencias", "POST", dadosDaChamada({ dia }));
    expect(resposta.status).toBe(400);
  }
  expect(await consultar()).toBeNull();
});
