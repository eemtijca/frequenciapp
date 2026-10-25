// Contratos da cópia JSON de frequências parciais, com dados sintéticos próprios
// e restauração por mesclagem sem sobrescrever o histórico existente.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { CopiaFrequenciapp } from "@/application/backup";

const url = process.env.APP_URL ?? "http://localhost:3000";
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL });
let cookie = "";
let alunoId = "";
let turmaId = "";
let parcialId = "";
let copia: CopiaFrequenciapp;

async function chamar(caminho: string, corpo: unknown) {
  return fetch(`${url}${caminho}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}
async function limpar() {
  await banco.query("delete from alunos where nome = 'QA Cópia Parcial Aluno'");
  await banco.query(
    "delete from turmas where serie_id in (select id from series where nome = 'QA Cópia Parcial')",
  );
  await banco.query("delete from series where nome = 'QA Cópia Parcial'");
}
function novaCopia() {
  return structuredClone(copia);
}
async function restaurar(dados = novaCopia()) {
  const resposta = await chamar("/api/backup", dados);
  expect(resposta.status).toBe(200);
  return (await resposta.json()) as { adicionadas: number; identicas: number; conflitos: number };
}

beforeAll(async () => {
  await banco.connect();
  await limpar();
  const entrada = await chamar("/api/auth/entrar", {
    email: process.env.TESTE_ADMIN_EMAIL ?? "direcao@escola.exemplo",
    senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  });
  expect(entrada.status).toBe(200);
  cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
  const serie = await banco.query<{ id: string }>(
    "insert into series (nome, ordem) values ('QA Cópia Parcial', 98) returning id",
  );
  const serieId = serie.rows[0]?.id ?? "";
  const turma = await banco.query<{ id: string }>(
    "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
    [serieId],
  );
  turmaId = turma.rows[0]?.id ?? "";
  const aluno = await banco.query<{ id: string }>(
    "insert into alunos (nome, turma_id, turma_original_id, ordem) values ('QA Cópia Parcial Aluno', $1, $1, 1) returning id",
    [turmaId],
  );
  alunoId = aluno.rows[0]?.id ?? "";
  const parcial = await banco.query<{ id: string }>(
    "insert into frequencias_parciais (aluno_id, turma_id, dia, aluno_nome, turma_nome, tipo, aulas, observacao, registrado_seduc, registrado_seduc_em, registrado_seduc_por_nome, revisao, criado_em, atualizado_em) values ($1, $2, '2026-06-15', 'QA Nome histórico', 'QA Turma histórica A', 'AULAS', array[2,3,4], 'QA Transporte atrasou', true, '2026-06-15T18:00:00Z', 'QA Responsável histórico', 3, '2026-06-15T16:00:00Z', '2026-06-15T18:00:00Z') returning id",
    [alunoId, turmaId],
  );
  parcialId = parcial.rows[0]?.id ?? "";
  const exportacao = await chamar("/api/backup/exportar", {
    senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
  });
  expect(exportacao.status).toBe(200);
  const completa = (await exportacao.json()) as CopiaFrequenciapp;
  expect(completa.versao).toBe(1);
  expect(completa.frequenciasParciais?.find((item) => item.id === parcialId)).toMatchObject({
    alunoNome: "QA Nome histórico",
    turmaNome: "QA Turma histórica A",
    aulas: [2, 3, 4],
    registradoSeduc: true,
    registradoSeducEm: "2026-06-15T18:00:00.000Z",
    registradoSeducPorNome: "QA Responsável histórico",
    revisao: 3,
  });
  expect(completa).not.toHaveProperty("integracoes");
  expect(completa).not.toHaveProperty("googleRefreshToken");
  copia = {
    formato: completa.formato,
    versao: completa.versao,
    series: completa.series.filter((item) => item.id === serieId),
    turmas: completa.turmas.filter((item) => item.id === turmaId),
    horarios: [],
    alunos: completa.alunos.filter((item) => item.id === alunoId),
    frequencias: [],
    saidas: [],
    justificativas: [],
    frequenciasParciais: completa.frequenciasParciais?.filter((item) => item.id === parcialId),
  };
});
afterAll(async () => {
  await limpar();
  await banco.end();
});

describe("cópia JSON da chamada parcial", () => {
  it("restaura identidade, histórico e confirmação sem criar chamada regular", async () => {
    await banco.query("delete from frequencias_parciais where id = $1", [parcialId]);
    expect((await restaurar()).adicionadas).toBe(1);
    const { rows } = await banco.query(
      "select id, aluno_nome, turma_nome, aulas, revisao, registrado_seduc, registrado_seduc_por_nome, registrado_seduc_em, criado_em, atualizado_em from frequencias_parciais where id = $1",
      [parcialId],
    );
    expect(rows[0]).toMatchObject({
      id: parcialId,
      aluno_nome: "QA Nome histórico",
      turma_nome: "QA Turma histórica A",
      aulas: [2, 3, 4],
      revisao: 3,
      registrado_seduc: true,
      registrado_seduc_por_nome: "QA Responsável histórico",
      registrado_seduc_em: new Date("2026-06-15T18:00:00Z"),
      criado_em: new Date("2026-06-15T16:00:00Z"),
      atualizado_em: new Date("2026-06-15T18:00:00Z"),
    });
    expect((await restaurar()).conflitos).toBe(0);
    expect(
      (await banco.query("select id from frequencias where turma_id = $1", [turmaId])).rows,
    ).toHaveLength(0);
  });
  it("mantém o registro diante de divergência por aluno e dia ou por identificador", async () => {
    for (const mudanca of [
      { id: randomUUID(), observacao: "QA Divergência" },
      { dia: "2026-06-16", observacao: "QA Outro dia com o mesmo código" },
    ]) {
      const dados = novaCopia();
      const registro = dados.frequenciasParciais?.[0];
      if (!registro) throw new Error("Registro sintético ausente.");
      Object.assign(registro, mudanca);
      expect((await restaurar(dados)).conflitos).toBe(1);
    }
    const { rows } = await banco.query(
      "select id, observacao from frequencias_parciais where aluno_id = $1",
      [alunoId],
    );
    expect(rows).toEqual([{ id: parcialId, observacao: "QA Transporte atrasou" }]);
  });
  it("aceita cópia anterior sem frequências parciais e preserva os registros", async () => {
    const dados = novaCopia();
    delete dados.frequenciasParciais;
    expect((await restaurar(dados)).conflitos).toBe(0);
    expect(
      (await banco.query("select id from frequencias_parciais where id = $1", [parcialId])).rows,
    ).toHaveLength(1);
  });
  it("recusa datas, aulas, turno e confirmação incoerentes antes de gravar", async () => {
    for (const mudanca of [
      { dia: "2026-02-30" },
      { tipo: "TURNO", turno: null, aulas: [] },
      { tipo: "TURNO", turno: "MANHA", aulas: [1] },
      { tipo: "AULAS", turno: "TARDE" },
      { tipo: "DIA_INTEIRO", turno: "MANHA", aulas: [] },
      { tipo: "DIA_INTEIRO", turno: null, aulas: [1] },
      { aulas: [] },
      { aulas: [1, 1] },
      { aulas: [3, 2] },
      { aulas: [31] },
      { registradoSeduc: false },
      { registradoSeducEm: null },
      { registradoSeducPorNome: null },
      { registradoSeducEm: "2026-06-15" },
      { atualizadoEm: "2026-06-14T12:00:00Z" },
    ]) {
      const dados = novaCopia();
      const registro = dados.frequenciasParciais?.[0];
      if (!registro) throw new Error("Registro sintético ausente.");
      Object.assign(registro, mudanca);
      expect((await chamar("/api/backup", dados)).status).toBe(400);
    }
    expect((await restaurar()).conflitos).toBe(0);
  });
  it("conta referência ausente como conflito sem criar o registro", async () => {
    for (const mudanca of [{ alunoId: randomUUID() }, { turmaId: randomUUID() }]) {
      const dados = novaCopia();
      const registro = dados.frequenciasParciais?.[0];
      if (!registro) throw new Error("Registro sintético ausente.");
      Object.assign(registro, { ...mudanca, id: randomUUID(), dia: "2026-06-16" });
      expect((await restaurar(dados)).conflitos).toBe(1);
    }
  });
  it("restaura o nome da confirmação quando a conta histórica já não existe", async () => {
    const dados = novaCopia();
    const registro = dados.frequenciasParciais?.[0];
    if (!registro) throw new Error("Registro sintético ausente.");
    const historicoId = randomUUID();
    Object.assign(registro, {
      id: historicoId,
      dia: "2026-06-16",
      registradoSeducPorId: randomUUID(),
      criadoPorId: randomUUID(),
      atualizadoPorId: randomUUID(),
    });
    expect((await restaurar(dados)).adicionadas).toBe(1);
    const { rows } = await banco.query(
      "select registrado_seduc_por_id, registrado_seduc_por_nome, criado_por_id, atualizado_por_id from frequencias_parciais where id = $1",
      [historicoId],
    );
    expect(rows).toEqual([
      {
        registrado_seduc_por_id: null,
        registrado_seduc_por_nome: "QA Responsável histórico",
        criado_por_id: null,
        atualizado_por_id: null,
      },
    ]);
  });

  it("restaura e exporta dia inteiro sem criar aulas ou chamada regular", async () => {
    const dados = novaCopia();
    const registro = dados.frequenciasParciais?.[0];
    if (!registro) throw new Error("Registro sintético ausente.");
    const integralId = randomUUID();
    Object.assign(registro, {
      id: integralId,
      dia: "2026-06-17",
      tipo: "DIA_INTEIRO",
      turno: null,
      aulas: [],
    });
    expect((await restaurar(dados)).adicionadas).toBe(1);
    expect((await restaurar(dados)).conflitos).toBe(0);
    const exportacao = await chamar("/api/backup/exportar", {
      senha: process.env.TESTE_ADMIN_SENHA ?? "DirecaoFrequencia2026",
    });
    expect(exportacao.status).toBe(200);
    const completa = (await exportacao.json()) as CopiaFrequenciapp;
    expect(completa.frequenciasParciais?.find((item) => item.id === integralId)).toMatchObject({
      id: integralId,
      dia: "2026-06-17",
      tipo: "DIA_INTEIRO",
      turno: null,
      aulas: [],
      registradoSeduc: true,
      registradoSeducPorNome: "QA Responsável histórico",
    });
    expect(
      (await banco.query("select id from frequencias where turma_id = $1", [turmaId])).rows,
    ).toHaveLength(0);
  });
});
