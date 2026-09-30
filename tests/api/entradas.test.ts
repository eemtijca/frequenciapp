// Contratos das entradas atrasadas com massa própria e banco isolado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { EntradaAtrasada } from "@/domain/entradas";
const url = process.env.APP_URL ?? "http://localhost:3000";
const dia = "2026-06-15";
let aluno = "";
let turma = "";
let outraTurma = "";
let cookie = "";
let cookieAdmin = "";
let id = "";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
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
async function limpar() {
  await banco.query("delete from alunos where nome like 'QA Entrada %'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QA Entradas')",
  );
  await banco.query("delete from series where nome = 'QA Entradas'");
}
beforeAll(async () => {
  await banco.connect();
  await limpar();
  cookie = await entrar(
    process.env.TESTE_EMAIL ?? "demo@escola.exemplo",
    process.env.TESTE_SENHA ?? "DemoFrequencia2026",
  );
  cookieAdmin = await entrar(
    process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
    process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  );
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ('QA Entradas', 98) returning id",
  );
  const turmas = await banco.query<{ id: string; nome: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A'), ($1, 'B') returning id, nome",
    [serie.rows[0]?.id],
  );
  turma = turmas.rows.find((item) => item.nome === "A")?.id ?? "";
  outraTurma = turmas.rows.find((item) => item.nome === "B")?.id ?? "";
  const alunos = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem) values ('QA Entrada Um', $1, $1, 1) returning id",
    [turma],
  );
  aluno = alunos.rows[0]?.id ?? "";
});
afterAll(async () => {
  await limpar();
  await banco.end();
});
describe("entradas atrasadas", () => {
  it("exige sessão e origem válida", async () => {
    expect((await chamar(`/api/entradas?de=${dia}&ate=${dia}`, "GET", undefined, "")).status).toBe(
      401,
    );
    expect(
      (
        await fetch(`${url}/api/entradas`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: "https://exemplo.invalid",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect((await chamar("/api/planilha-entradas/preparar", "POST")).status).toBe(403);
    expect(
      (
        await chamar(
          "/api/planilha-saidas/mapa",
          "POST",
          {
            planilha: {
              nome: "QA",
              url: "https://example.invalid",
              fuso: "America/Fortaleza",
              versao: 1,
            },
            abas: [{ nome: "Entradas" }],
            aba: "Entradas",
          },
          cookieAdmin,
        )
      ).status,
    ).toBe(400);
  });
  it("valida aluno, horário, motivo, período e data futura", async () => {
    for (const dados of [
      { alunoId: "inválido", dia, horario: "08:00", motivo: "Transporte" },
      { alunoId: aluno, dia, horario: "25:00", motivo: "Transporte" },
      { alunoId: aluno, dia, horario: "08:00", motivo: " " },
      { alunoId: aluno, dia: "2999-06-15", horario: "08:00", motivo: "Transporte" },
    ])
      expect((await chamar("/api/entradas", "POST", dados)).status).toBe(400);
    expect((await chamar(`/api/entradas?de=${dia}&ate=2026-06-14`)).status).toBe(400);
  });
  it("registra uma entrada por aluno e dia sem criar frequência ou saída", async () => {
    const dados = { alunoId: aluno, dia, horario: "08:15", motivo: "Transporte atrasou" };
    expect((await chamar("/api/entradas", "POST", dados)).status).toBe(201);
    expect((await chamar("/api/entradas", "POST", dados)).status).toBe(409);
    const resposta = await chamar(`/api/entradas?de=${dia}&ate=${dia}&turmaId=${turma}`);
    const corpo = (await resposta.json()) as { entradas: EntradaAtrasada[] };
    id = corpo.entradas[0]?.id ?? "";
    expect(corpo.entradas).toHaveLength(1);
    expect(corpo.entradas[0]).toMatchObject({
      horario: "08:15",
      motivo: "Transporte atrasou",
      turmaRotulo: "QA Entradas A",
      registradoPorNome: "Demo",
    });
    expect(
      (
        await banco.query<{ total: number }>(
          "select count(*)::int as total from saidas_antecipadas where aluno_id = $1",
          [aluno],
        )
      ).rows[0]?.total,
    ).toBe(0);
    expect(
      (
        await banco.query<{ total: number }>(
          "select count(*)::int as total from frequencias where turma_id = $1",
          [turma],
        )
      ).rows[0]?.total,
    ).toBe(0);
  });
  it("preserva a turma registrada depois da transferência", async () => {
    await banco.query("update alunos set turma_id = $1 where id = $2", [outraTurma, aluno]);
    const corpo = (await (
      await chamar(`/api/entradas?de=${dia}&ate=${dia}&turmaId=${turma}`)
    ).json()) as { entradas: EntradaAtrasada[] };
    expect(corpo.entradas[0]?.turmaRotulo).toBe("QA Entradas A");
    expect(
      (await (await chamar(`/api/entradas?de=${dia}&ate=${dia}&turmaId=${outraTurma}`)).json())
        .entradas,
    ).toEqual([]);
  });
  it("exporta, mescla sem sobrescrever e restaura pela cópia JSON", async () => {
    const copia = await (await chamar("/api/backup", "GET", undefined, cookieAdmin)).json();
    expect(copia.entradas.find((entrada: EntradaAtrasada) => entrada.id === id)).toMatchObject({
      horario: "08:15",
      turmaId: turma,
    });
    expect((await chamar(`/api/entradas/${id}`, "DELETE")).status).toBe(200);
    const resposta = await chamar("/api/backup", "POST", copia, cookieAdmin);
    expect(resposta.status).toBe(200);
    expect(
      (
        await banco.query<{ id: string }>("select id from entradas_atrasadas where aluno_id = $1", [
          aluno,
        ])
      ).rows[0]?.id,
    ).toBe(id);
    copia.entradas.find((entrada: EntradaAtrasada) => entrada.id === id).motivo = "Outro motivo";
    expect((await chamar("/api/backup", "POST", copia, cookieAdmin)).status).toBe(200);
    expect(
      (
        await banco.query<{ motivo: string }>(
          "select motivo from entradas_atrasadas where id = $1",
          [id],
        )
      ).rows[0]?.motivo,
    ).toBe("Transporte atrasou");
    delete copia.entradas;
    expect((await chamar("/api/backup", "POST", copia, cookieAdmin)).status).toBe(200);
    expect(
      (
        await banco.query<{ total: number }>(
          "select count(*)::int as total from entradas_atrasadas where id = $1",
          [id],
        )
      ).rows[0]?.total,
    ).toBe(1);
  });
  it("não registra entrada para aluno desativado ou desistente", async () => {
    await banco.query("update alunos set ativo = false where id = $1", [aluno]);
    expect(
      (
        await chamar("/api/entradas", "POST", {
          alunoId: aluno,
          dia: "2026-06-16",
          horario: "08:00",
          motivo: "Transporte",
        })
      ).status,
    ).toBe(409);
    await banco.query(
      "update alunos set ativo = true, desistente_em = '2026-06-16' where id = $1",
      [aluno],
    );
    expect(
      (
        await chamar("/api/entradas", "POST", {
          alunoId: aluno,
          dia: "2026-06-16",
          horario: "08:00",
          motivo: "Transporte",
        })
      ).status,
    ).toBe(409);
  });
  it("não envia com integração desligada e remove com auditoria", async () => {
    expect(
      (
        await chamar("/api/planilha-entradas/enviar", "POST", {
          de: dia,
          ate: dia,
          planoHash: "falso",
        })
      ).status,
    ).toBe(400);
    expect((await chamar(`/api/entradas/${id}`, "DELETE")).status).toBe(200);
    expect((await chamar(`/api/entradas/${id}`, "DELETE")).status).toBe(404);
    expect(
      (
        await banco.query<{ total: number }>(
          "select count(*)::int as total from auditoria where acao = 'entrada.remover' and alvo = $1",
          [`entrada:${id}`],
        )
      ).rows[0]?.total,
    ).toBeGreaterThan(0);
  });
});
