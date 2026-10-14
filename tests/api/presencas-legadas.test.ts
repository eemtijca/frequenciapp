// Recupera listas legadas em um schema descartável e confere os consumidores reais.
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Aluno, Horario } from "@/domain/frequencia";

const configuracao = vi.hoisted(() => ({
  databaseUrl: "",
  fuso: "America/Fortaleza",
  poolMaxConexoes: 2,
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: configuracao }));

import { banco } from "@/infra/banco";
import { carregarFrequencia, listarFrequenciasDoPeriodo } from "@/application/frequencias";
import { lerEstadoPlanilha } from "@/application/planilha";
import { montarGrade } from "@/domain/frequencia";
import { detectarEsquema, hashTexto, montarTurmaPlanilha } from "@/domain/planilha";

const MIGRACAO = "20261013224456_recupera_lista_chamadas_antigas";
const schema = `QA_presencas_${randomUUID().replaceAll("-", "")}`;
const globalComBanco = globalThis as unknown as { prisma?: PrismaClient };
const prismaAnterior = globalComBanco.prisma;
const ids = {
  serie: randomUUID(),
  turma: randomUUID(),
  outra: randomUUID(),
  aula: randomUUID(),
  presente: randomUUID(),
  movido: randomUUID(),
  faltoso: randomUUID(),
  posterior: randomUUID(),
  outraLista: randomUUID(),
  inativo: randomUUID(),
  desistente: randomUUID(),
};
let administrador: pg.Client;
let sql: string;

async function recuperar() {
  await administrador.query(sql);
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (!conexao) throw new Error("DATABASE_URL é necessária para os testes da lista legada.");
  administrador = new pg.Client({ connectionString: conexao });
  await administrador.connect();
  await administrador.query(`CREATE SCHEMA "${schema}"`);
  await administrador.query("SELECT set_config('search_path', quote_ident($1), false)", [schema]);
  const pasta = path.resolve("prisma/migrations");
  const migracoes = (await readdir(pasta, { withFileTypes: true }))
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
  for (const migracao of migracoes) {
    const conteudo = await readFile(path.join(pasta, migracao, "migration.sql"), "utf8");
    if (migracao === MIGRACAO) sql = conteudo;
    else await administrador.query(conteudo);
  }
  await administrador.query(`CREATE TABLE _prisma_migrations (
    migration_name text, started_at timestamptz, finished_at timestamptz, rolled_back_at timestamptz
  )`);
  const url = new URL(conexao);
  url.searchParams.set("schema", schema);
  configuracao.databaseUrl = url.toString();
  vi.stubEnv("DATABASE_SCHEMA", schema);
  globalComBanco.prisma = undefined;
});

beforeEach(async () => {
  await administrador.query(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
    migration_name text, started_at timestamptz, finished_at timestamptz, rolled_back_at timestamptz
  )`);
  await administrador.query(
    "TRUNCATE series, feriados, auditoria, sincronizacoes_planilha, _prisma_migrations CASCADE",
  );
  await administrador.query(`INSERT INTO _prisma_migrations VALUES
    ('20260928124039_lista_da_chamada','2026-09-28T12:40:39Z','2026-09-28T12:41:00Z',NULL)`);
  await administrador.query(
    "INSERT INTO series (id,nome,ordem) VALUES ($1,'QA Série histórica',1)",
    [ids.serie],
  );
  await administrador.query(
    "INSERT INTO turmas (id,serie_id,nome) VALUES ($1,$3,'A'),($2,$3,'B')",
    [ids.turma, ids.outra, ids.serie],
  );
  await administrador.query(
    `INSERT INTO horarios (id,turma_id,ordem,inicio,fim,dias_semana)
    VALUES ($1,$2,1,'07:00','07:50',ARRAY[1,2,3,4,5])`,
    [ids.aula, ids.turma],
  );
  const alunos = [
    [ids.presente, ids.turma, "QA Presente importado", "2026-09-25T08:00:00Z", true, null],
    [ids.movido, ids.outra, "QA Presente remanejado", "2026-09-10T08:00:00Z", true, null],
    [ids.faltoso, ids.turma, "QA Falta confirmada", "2026-09-10T08:00:00Z", true, null],
    [ids.posterior, ids.turma, "QA Cadastro posterior", "2026-09-28T08:00:00Z", true, null],
    [ids.outraLista, ids.outra, "QA Lista de outra turma", "2026-09-10T08:00:00Z", true, null],
    [ids.inativo, ids.turma, "QA Aluno inativo", "2026-09-10T08:00:00Z", false, null],
    [
      ids.desistente,
      ids.turma,
      "QA Desistente anterior",
      "2026-09-10T08:00:00Z",
      true,
      "2026-09-10",
    ],
  ];
  for (const [indice, aluno] of alunos.entries()) {
    await administrador.query(
      `INSERT INTO alunos (id,turma_id,turma_original_id,nome,criado_em,ativo,desistente_em,ordem)
      VALUES ($1,$2,$7,$3,$4,$5,$6,$8)`,
      [...aluno, ids.turma, indice + 1],
    );
  }
  for (const [dia, atualizada] of [
    ["2026-09-15", "2026-09-27T09:00:00Z"],
    ["2026-09-16", "2026-09-29T09:00:00Z"],
    ["2026-09-17", "2026-09-27T09:00:00Z"],
    ["2026-09-18", "2026-10-05T09:00:00Z"],
    ["2026-09-27", "2026-09-27T09:00:00Z"],
  ]) {
    await administrador.query(
      `INSERT INTO frequencias (turma_id,dia,revisao,atualizado_em)
      VALUES ($1,$2,4,$3)`,
      [ids.turma, dia, atualizada],
    );
  }
  await administrador.query(
    `INSERT INTO feriados (dia,nome,atualizado_em) VALUES ('2026-09-17','QA Feriado',now())`,
  );
  await administrador.query(
    `INSERT INTO alunos_chamada (frequencia_id,aluno_id,registrado_seduc,revisao_seduc)
    SELECT id,$1,true,3 FROM frequencias WHERE turma_id=$2 AND dia='2026-09-15'`,
    [ids.faltoso, ids.turma],
  );
  await administrador.query(
    `INSERT INTO faltas (frequencia_id,aluno_id,horario_id)
    SELECT id,$1,$2 FROM frequencias WHERE turma_id=$3 AND dia='2026-09-15'`,
    [ids.faltoso, ids.aula, ids.turma],
  );
  await administrador.query(
    `INSERT INTO aulas_chamada (frequencia_id,horario_id)
    SELECT id,$1 FROM frequencias WHERE turma_id=$2 AND dia='2026-09-15'`,
    [ids.aula, ids.turma],
  );
  const outra = await administrador.query<{ id: string }>(
    `INSERT INTO frequencias (turma_id,dia,atualizado_em)
    VALUES ($1,'2026-09-15','2026-09-29T09:00:00Z') RETURNING id`,
    [ids.outra],
  );
  await administrador.query("INSERT INTO alunos_chamada (frequencia_id,aluno_id) VALUES ($1,$2)", [
    outra.rows[0]?.id,
    ids.outraLista,
  ]);
  const arquivo = "QA-planilha-presencas-legadas";
  const abaId = 7;
  const nomeAba = "QA Série histórica A";
  const estrutura = detectarEsquema(
    { nome: nomeAba, valores: [["Aluno", "15/09/2026"]], formulas: [], linhas: 1, colunas: 2 },
    2026,
  );
  const esquema = {
    abas: [{ ...estrutura, abaId }],
    mapa: [{ aba: nomeAba, turmaOriginalId: ids.turma }],
  };
  await administrador.query(
    `INSERT INTO integracoes_planilha (id, google_planilha_id, esquema, atualizado_em)
     VALUES ('principal', $1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET google_planilha_id = EXCLUDED.google_planilha_id,
       esquema = EXCLUDED.esquema, atualizado_em = EXCLUDED.atualizado_em`,
    [arquivo, JSON.stringify(esquema)],
  );
  const destino = `frequencia:${hashTexto(JSON.stringify([arquivo, abaId]))}`;
  await administrador.query(
    `INSERT INTO sincronizacoes_planilha (turma_original_id,destino,de,ate,modalidade,resultado,plano_hash,criado_em)
     VALUES ($1,$2,'2026-09-15','2026-09-15','CONSERVADOR','SUCESSO','QA envio anterior','2026-09-30T10:00:00Z')`,
    [ids.turma, destino],
  );
});

afterAll(async () => {
  if (globalComBanco.prisma !== prismaAnterior) await globalComBanco.prisma?.$disconnect();
  globalComBanco.prisma = prismaAnterior;
  vi.unstubAllEnvs();
  await administrador?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await administrador?.end();
});

describe("recuperação da lista histórica", () => {
  it("recupera P na consulta da Chamada, na Grade e na fonte das planilhas", async () => {
    const antes = await carregarFrequencia(ids.turma, "2026-09-15");
    expect(antes?.alunos).toEqual([ids.faltoso]);
    await recuperar();
    const chamada = await carregarFrequencia(ids.turma, "2026-09-15");
    expect(chamada?.alunos?.sort()).toEqual([ids.presente, ids.movido, ids.faltoso].sort());
    expect(chamada?.faltas).toEqual(antes?.faltas);
    expect(chamada?.confirmacoesSeduc?.find((item) => item.alunoId === ids.faltoso)).toEqual(
      antes?.confirmacoesSeduc?.[0],
    );
    expect(
      chamada?.confirmacoesSeduc?.find((item) => item.alunoId === ids.presente)?.registradoSeduc,
    ).toBe(false);
    const alunos: Aluno[] = (await banco().aluno.findMany()).map((item) => ({
      ...item,
      desistenteEm: item.desistenteEm?.toISOString().slice(0, 10) ?? null,
      situacaoAtualizadaEm: item.situacaoAtualizadaEm?.toISOString() ?? null,
    }));
    const horarios: Horario[] = (await banco().horario.findMany()).map((item) => ({
      ...item,
      disciplinas: {},
    }));
    const frequencias = await listarFrequenciasDoPeriodo("2026-09-15", "2026-09-27");
    const grade = montarGrade(alunos, frequencias, ["2026-09-15", "2026-09-23"], horarios);
    expect(grade.linhas.find((item) => item.aluno.id === ids.presente)?.marcas).toEqual({
      "2026-09-15": "P",
      "2026-09-23": undefined,
    });
    expect(grade.linhas.find((item) => item.aluno.id === ids.movido)?.marcas["2026-09-15"]).toBe(
      "P",
    );
    expect(grade.linhas.find((item) => item.aluno.id === ids.faltoso)?.marcas["2026-09-15"]).toBe(
      "F",
    );
    const planilha = montarTurmaPlanilha(
      ids.turma,
      "QA A",
      alunos,
      frequencias,
      horarios,
      ["2026-09-15"],
      () => "QA Turma",
    );
    expect(
      planilha.linhas.find((item) => item.alunoId === ids.presente)?.marcas["2026-09-15"],
    ).toBe("P");
    expect(
      planilha.linhas.find((item) => item.alunoId === ids.posterior)?.marcas["2026-09-15"],
    ).toBeUndefined();
  });

  it("preserva listas novas, correções posteriores, feriados e domingos", async () => {
    await recuperar();
    for (const dia of ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-27"]) {
      const chamada = await carregarFrequencia(ids.turma, dia);
      expect(chamada?.alunos, dia).toEqual([]);
      expect(chamada?.revisao, dia).toBe(4);
    }
    const antiga = await carregarFrequencia(ids.turma, "2026-09-15");
    expect(antiga?.alunos).not.toContain(ids.posterior);
    expect(antiga?.alunos).not.toContain(ids.outraLista);
    expect(antiga?.alunos).not.toContain(ids.inativo);
    expect(antiga?.alunos).not.toContain(ids.desistente);
    expect(await carregarFrequencia(ids.turma, "2026-09-23")).toBeNull();
  });

  it("gera pendência de reenvio, revisão e auditoria somente uma vez", async () => {
    const pendentes = (await lerEstadoPlanilha()).alteradasDepois;
    await recuperar();
    const recuperada = await carregarFrequencia(ids.turma, "2026-09-15");
    expect(recuperada?.revisao).toBe(5);
    expect((await lerEstadoPlanilha()).alteradasDepois).toBe(pendentes + 1);
    await recuperar();
    expect(await carregarFrequencia(ids.turma, "2026-09-15")).toEqual(recuperada);
    const auditoria = await administrador.query("SELECT acao,usuario_id FROM auditoria");
    expect(auditoria.rows).toEqual([
      { acao: "frequencia.recuperar_lista_legada", usuario_id: null },
    ]);
  });

  it("não usa o histórico de migrações de outro schema", async () => {
    await administrador.query("DROP TABLE _prisma_migrations");
    await recuperar();
    expect((await carregarFrequencia(ids.turma, "2026-09-15"))?.alunos).toEqual([ids.faltoso]);
  });
});
