// Contratos da turma reorganizada: a chamada segue a turma atual, a lista de
// cada chamada fica gravada e a consolidação pela turma original não muda
// quando o aluno troca de turma. Massa com prefixo QR.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { montarGrade, type Aluno, type Frequencia, type Turma } from "@/domain/frequencia";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const EMAIL_COORD = process.env.TESTE_EMAIL ?? "demo@escola.exemplo";
const SENHA_COORD = process.env.TESTE_SENHA ?? "DemoFrequencia2026";
// Segunda e terça, dias da aula padrão das turmas novas.
const DIA_1 = "2026-06-22";
const DIA_2 = "2026-06-23";

let banco: pg.Client | null = null;
let cookieAdmin = "";
let cookieCoord = "";
let turmaA = "";
let turmaB = "";
const ids: Record<"movido" | "fica" | "deB", string> = { movido: "", fica: "", deB: "" };

async function limparMassa() {
  if (!banco) return;
  const daSerie =
    "select t.id from turmas t join series s on s.id = t.serie_id where s.nome = 'QR Ano'";
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(
    `delete from turmas where serie_id in (select id from series where nome = 'QR Ano')`,
  );
  await banco.query("delete from series where nome = 'QR Ano'");
}

function chamar(caminho: string, opcoes: RequestInit = {}, cookie = ""): Promise<Response> {
  const cabecalhos = new Headers(opcoes.headers);
  cabecalhos.set("Origin", APP_URL);
  if (cookie) cabecalhos.set("Cookie", cookie);
  if (opcoes.body) cabecalhos.set("Content-Type", "application/json");
  return fetch(`${APP_URL}${caminho}`, { ...opcoes, headers: cabecalhos, redirect: "manual" });
}

async function json<T>(resposta: Response): Promise<T> {
  return (await resposta.json()) as T;
}

async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await chamar("/api/auth/entrar", {
    method: "POST",
    body: JSON.stringify({ login: email, senha, lembrar: false }),
  });
  return resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function criarAluno(nome: string, turmaId: string): Promise<string> {
  const resposta = await chamar(
    "/api/alunos",
    { method: "POST", body: JSON.stringify({ nome, turmaId }) },
    cookieAdmin,
  );
  expect(resposta.status).toBe(201);
  return (await json<{ aluno: { id: string } }>(resposta)).aluno.id;
}

async function salvar(dia: string, turmaId: string, faltas: string[], revisao: number) {
  const resposta = await chamar(
    "/api/frequencias",
    { method: "POST", body: JSON.stringify({ dia, turmaId, faltas, revisao }) },
    cookieCoord,
  );
  expect(resposta.status).toBe(200);
  return (await json<{ frequencia: Frequencia }>(resposta)).frequencia;
}

async function carregar(dia: string, turmaId: string): Promise<Frequencia | null> {
  const resposta = await chamar(`/api/frequencias?dia=${dia}&turmaId=${turmaId}`, {}, cookieCoord);
  return (await json<{ frequencia: Frequencia | null }>(resposta)).frequencia;
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (conexao?.startsWith("postgresql://")) {
    banco = new pg.Client({ connectionString: conexao });
    await banco.connect();
  }
  await limparMassa();
  cookieAdmin = await entrar(EMAIL_ADMIN, SENHA_ADMIN);
  cookieCoord = await entrar(EMAIL_COORD, SENHA_COORD);
  const serie = await json<{ serie: { id: string } }>(
    await chamar(
      "/api/series",
      { method: "POST", body: JSON.stringify({ nome: "QR Ano", ordem: 92 }) },
      cookieAdmin,
    ),
  );
  for (const nome of ["A", "B"]) {
    const turma = await json<{ turma: { id: string } }>(
      await chamar(
        "/api/turmas",
        { method: "POST", body: JSON.stringify({ serieId: serie.serie.id, nome }) },
        cookieAdmin,
      ),
    );
    if (nome === "A") turmaA = turma.turma.id;
    else turmaB = turma.turma.id;
  }
  ids.movido = await criarAluno("QR Aluno Movido", turmaA);
  ids.fica = await criarAluno("QR Aluno Fica", turmaA);
  ids.deB = await criarAluno("QR Aluno de B", turmaB);
});

afterAll(async () => {
  await limparMassa();
  if (banco) await banco.end();
});

describe("chamada pela turma atual, consolidação pela turma original", () => {
  it("grava na chamada nova a relação atual da turma", async () => {
    const frequencia = await salvar(DIA_1, turmaA, [], 0);
    expect([...(frequencia.alunos ?? [])].sort()).toEqual([ids.movido, ids.fica].sort());
  });

  it("move o aluno para a turma B mantendo a origem A", async () => {
    const resposta = await chamar(
      `/api/alunos/${ids.movido}`,
      { method: "PATCH", body: JSON.stringify({ turmaId: turmaB }) },
      cookieAdmin,
    );
    expect(resposta.status).toBe(200);
    const { aluno } = await json<{ aluno: Aluno }>(resposta);
    expect(aluno.turmaId).toBe(turmaB);
    expect(aluno.turmaOriginalId).toBe(turmaA);
  });

  it("faz a chamada da turma B com a relação atual, incluindo o aluno movido", async () => {
    const frequencia = await salvar(DIA_2, turmaB, [ids.movido], 0);
    expect([...(frequencia.alunos ?? [])].sort()).toEqual([ids.movido, ids.deB].sort());
  });

  it("mantém o aluno movido na chamada antiga da turma A, mesmo ao salvar de novo", async () => {
    const antes = await carregar(DIA_1, turmaA);
    expect(antes?.alunos).toContain(ids.movido);
    const depois = await salvar(DIA_1, turmaA, [ids.fica], antes?.revisao ?? 1);
    expect(depois.alunos).toContain(ids.movido);
    const segundaDaA = await salvar(DIA_2, turmaA, [], 0);
    expect(segundaDaA.alunos).toEqual([ids.fica]);
  });

  it("consolida os dois dias na linha do aluno pela turma original", async () => {
    const [alunos, frequencias, turmas] = await Promise.all([
      chamar("/api/alunos", {}, cookieAdmin).then((r) => json<{ alunos: Aluno[] }>(r)),
      chamar(`/api/frequencias?de=${DIA_1}&ate=${DIA_2}`, {}, cookieCoord).then((r) =>
        json<{ frequencias: Frequencia[] }>(r),
      ),
      chamar("/api/turmas", {}, cookieAdmin).then((r) => json<{ turmas: Turma[] }>(r)),
    ]);
    const daOrigemA = alunos.alunos.filter((aluno) => aluno.turmaOriginalId === turmaA);
    const grade = montarGrade(
      daOrigemA,
      frequencias.frequencias,
      [DIA_1, DIA_2],
      turmas.turmas.flatMap((turma) => turma.horarios),
    );
    const marcas = Object.fromEntries(
      grade.linhas.map((linha) => [linha.aluno.id, [linha.marcas[DIA_1], linha.marcas[DIA_2]]]),
    );
    expect(marcas[ids.movido]).toEqual(["P", "F"]);
    expect(marcas[ids.fica]).toEqual(["F", "P"]);
    expect(marcas[ids.deB]).toBeUndefined();
  });
});
