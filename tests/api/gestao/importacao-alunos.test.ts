// Contratos da importação da relação de alunos em CSV: prévia sem gravar, aplicação
// que move, reordena, cria e desativa mantendo o histórico, recusa para a
// coordenação e bloqueio que impede aplicar. Massa com prefixo QI.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { Aluno, Frequencia } from "@/domain/frequencia";
import type { PlanoDeImportacao } from "@/domain/importacao-alunos";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_ADMIN = process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo";
const SENHA_ADMIN = process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026";
const EMAIL_COORD = process.env.TESTE_EMAIL ?? "demo@escola.exemplo";
const SENHA_COORD = process.env.TESTE_SENHA ?? "DemoFrequencia2026";
const DIA = "2026-06-24";

let banco: pg.Client | null = null;
let cookieAdmin = "";
let cookieCoord = "";
let turmaA = "";
let turmaB = "";
const ids: Record<string, string> = {};

interface Resposta {
  plano: PlanoDeImportacao;
  aplicado: { criados: number; atualizados: number; desativados: number } | null;
}

async function limparMassa() {
  if (!banco) return;
  const daSerie =
    "select t.id from turmas t join series s on s.id = t.serie_id where s.nome = 'QI Ano'";
  await banco.query(`delete from frequencias where turma_id in (${daSerie})`);
  await banco.query(`delete from alunos where turma_id in (${daSerie})`);
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QI Ano')",
  );
  await banco.query("delete from series where nome = 'QI Ano'");
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

function importar(csv: string, aplicar = false, cookie = cookieAdmin): Promise<Response> {
  return chamar(
    "/api/alunos/importacao",
    { method: "POST", body: JSON.stringify({ csv, aplicar }) },
    cookie,
  );
}

// Relação no schema padrão, com BOM e CRLF como sai do Excel.
const RELACOES = [
  "\uFEFFturma_atual;ordem;nome;turma_original",
  "QI A;1;QI BRUNO;QI B",
  "QI A;2;QI ANA;QI A",
  "QI B;1;QI CARLA;QI A",
  "QI B;2;QI DAVI NOVO;QI B",
].join("\r\n");

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (conexao?.startsWith("postgresql://")) {
    banco = new pg.Client({ connectionString: conexao });
    await banco.connect();
  }
  await limparMassa();
  cookieAdmin = await entrar(EMAIL_ADMIN, SENHA_ADMIN);
  cookieCoord = await entrar(EMAIL_COORD, SENHA_COORD);
  // Série "QI" para os rótulos "QI A" e "QI B" casarem com o cadastro.
  const serie = await json<{ serie: { id: string } }>(
    await chamar(
      "/api/series",
      { method: "POST", body: JSON.stringify({ nome: "QI Ano", ordem: 94 }) },
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
  for (const [chave, nome, turmaId] of [
    ["ana", "QI Ana", turmaA],
    ["bruno", "QI Bruno", turmaB],
    ["carla", "QI Carla", turmaA],
    ["saiu", "QI Eva Saiu", turmaA],
  ] as const) {
    const criado = await json<{ aluno: { id: string } }>(
      await chamar(
        "/api/alunos",
        { method: "POST", body: JSON.stringify({ nome, turmaId }) },
        cookieAdmin,
      ),
    );
    ids[chave] = criado.aluno.id;
  }
  // Falta registrada antes da importação: precisa continuar no histórico.
  await chamar(
    "/api/frequencias",
    {
      method: "POST",
      body: JSON.stringify({ dia: DIA, turmaId: turmaA, faltas: [ids.carla], revisao: 0 }),
    },
    cookieCoord,
  );
});

afterAll(async () => {
  await limparMassa();
  if (banco) await banco.end();
});

describe("importação das relações de turma", () => {
  it("recusa a coordenação", async () => {
    expect((await importar(RELACOES, false, cookieCoord)).status).toBe(403);
  });

  it("mostra a prévia sem gravar nada", async () => {
    const resposta = await importar(RELACOES);
    expect(resposta.status).toBe(200);
    const { plano, aplicado } = await json<Resposta>(resposta);
    expect(aplicado).toBeNull();
    expect(plano.bloqueios).toEqual([]);
    expect(plano.turmas.map((turma) => turma.alunos)).toEqual([2, 2]);
    expect(plano.itens.find((item) => item.alunoId === null)?.nome).toBe("QI DAVI NOVO");
    expect(plano.desativar.map((aluno) => aluno.alunoId)).toEqual([ids.saiu]);
    const alunos = await json<{ alunos: Aluno[] }>(await chamar("/api/alunos", {}, cookieAdmin));
    expect(alunos.alunos.find((aluno) => aluno.id === ids.bruno)?.turmaId).toBe(turmaB);
  });

  it("aplica: move, reordena, cria, desativa e mantém o histórico", async () => {
    const resposta = await importar(RELACOES, true);
    expect(resposta.status).toBe(200);
    expect((await json<Resposta>(resposta)).aplicado).toEqual({
      criados: 1,
      atualizados: 3,
      desativados: 1,
    });
    const { alunos } = await json<{ alunos: Aluno[] }>(
      await chamar("/api/alunos", {}, cookieAdmin),
    );
    const por = (id: string | undefined) => alunos.find((aluno) => aluno.id === id);
    expect(por(ids.bruno)).toMatchObject({ turmaId: turmaA, turmaOriginalId: turmaB, ordem: 1 });
    expect(por(ids.ana)).toMatchObject({ turmaId: turmaA, turmaOriginalId: turmaA, ordem: 2 });
    expect(por(ids.carla)).toMatchObject({ turmaId: turmaB, turmaOriginalId: turmaA, ordem: 1 });
    expect(por(ids.saiu)?.ativo).toBe(false);
    expect(alunos.find((aluno) => aluno.nome === "QI DAVI NOVO")).toMatchObject({
      turmaId: turmaB,
      turmaOriginalId: turmaB,
      ordem: 2,
    });
    const { frequencia } = await json<{ frequencia: Frequencia | null }>(
      await chamar(`/api/frequencias?dia=${DIA}&turmaId=${turmaA}`, {}, cookieCoord),
    );
    expect(frequencia?.faltas.map((falta) => falta.alunoId)).toEqual([ids.carla]);
  });

  it("repetir a mesma relação não muda nada", async () => {
    const { aplicado } = await json<Resposta>(await importar(RELACOES, true));
    expect(aplicado).toEqual({ criados: 0, atualizados: 0, desativados: 0 });
  });

  it("não aplica com bloqueio", async () => {
    const resposta = await importar(
      "turma_atual;ordem;nome;turma_original\nQI A;1;QI ANA;QI Z",
      true,
    );
    expect(resposta.status).toBe(400);
    const foraDoPadrao = await importar("nome;turma\nQI ANA;QI A");
    const { plano } = await json<Resposta>(foraDoPadrao);
    expect(plano.bloqueios[0]).toContain("cabeçalho");
  });
});
