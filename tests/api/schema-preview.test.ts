// Regressão do isolamento por schema no mesmo PostgreSQL, com o adaptador
// e os casos de uso reais. Cada execução cria e remove apenas schemas próprios.
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";

const configuracao = vi.hoisted(() => ({
  databaseUrl: "",
  fuso: "America/Fortaleza",
  authSecret: "segredo-sintetico-schema-preview-com-32-caracteres",
  google: {},
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: configuracao }));

import { banco, objetoDoBanco } from "@/infra/banco";
import { lerParametrosAcesso } from "@/application/parametros-acesso";
import { lerEstadoPlanilha } from "@/application/planilha";
import { limiteDeTentativas, limparTentativas } from "@/infra/auth/limite";

const sufixo = randomUUID().replaceAll("-", "");
const schemaPreview = `QA_preview_${sufixo}`;
const schemaControle = `QA_controle-${sufixo}`;
const schemaAusente = `QA_ausente_${sufixo}`;
const schemasCriados: string[] = [];
const clientes = new Map<string, PrismaClient>();
const globalComBanco = globalThis as unknown as { prisma?: PrismaClient };
const prismaAnterior = globalComBanco.prisma;
let administrador: pg.Client;
let conexao: string;

function identificador(valor: string): string {
  return `"${valor.replaceAll('"', '""')}"`;
}

function selecionarRuntime(schema: string): PrismaClient {
  const url = new URL(conexao);
  url.searchParams.set("schema", schema);
  // Uma regressão no SQL direto só alcança outro schema descartável.
  // O destino diverge do Preview para detectar dependência de search_path.
  url.searchParams.set("options", `-c search_path=${identificador(schemaControle)}`);
  configuracao.databaseUrl = url.toString();
  globalComBanco.prisma = clientes.get(schema);
  const cliente = banco();
  clientes.set(schema, cliente);
  return cliente;
}

async function prepararSchema(schema: string, quantidadeChamadas: number) {
  const nome = identificador(schema);
  await administrador.query(`CREATE SCHEMA ${nome}`);
  schemasCriados.push(schema);
  await administrador.query("SELECT set_config('search_path', quote_ident($1), false)", [schema]);
  const pasta = path.resolve("prisma/migrations");
  const migracoes = (await readdir(pasta, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  for (const migracao of migracoes) {
    await administrador.query(await readFile(path.join(pasta, migracao, "migration.sql"), "utf8"));
  }

  const serie = randomUUID();
  const turma = randomUUID();
  const aluno = randomUUID();
  await administrador.query(
    `INSERT INTO ${nome}.series (id, nome, ordem) VALUES ($1, 'QA Ano', 1)`,
    [serie],
  );
  await administrador.query(
    `INSERT INTO ${nome}.turmas (id, serie_id, nome) VALUES ($1, $2, 'A')`,
    [turma, serie],
  );
  await administrador.query(
    `INSERT INTO ${nome}.alunos (id, turma_id, turma_original_id, nome, ordem)
     VALUES ($1, $2, $2, 'QA Aluno do schema', 1)`,
    [aluno, turma],
  );
  for (let indice = 1; indice <= quantidadeChamadas; indice++) {
    const frequencia = randomUUID();
    await administrador.query(
      `INSERT INTO ${nome}.frequencias (id, turma_id, dia, atualizado_em)
       VALUES ($1, $2, $3, now())`,
      [frequencia, turma, `2026-10-0${indice}`],
    );
    await administrador.query(
      `INSERT INTO ${nome}.alunos_chamada (frequencia_id, aluno_id) VALUES ($1, $2)`,
      [frequencia, aluno],
    );
  }
}

beforeAll(async () => {
  const configurada = process.env.DATABASE_URL;
  if (!configurada)
    throw new Error("DATABASE_URL é necessária para testar os schemas descartáveis.");
  conexao = configurada;
  administrador = new pg.Client({ connectionString: conexao });
  await administrador.connect();
  await prepararSchema(schemaPreview, 1);
  await prepararSchema(schemaControle, 2);
  await administrador.query("SET search_path TO pg_catalog");
});

beforeEach(async () => {
  for (const [schema, janela] of [
    [schemaPreview, 21],
    [schemaControle, 22],
  ] as const) {
    const nome = identificador(schema);
    await administrador.query(
      `INSERT INTO ${nome}.parametros_acesso (id, janela_minutos, atualizado_em)
       VALUES ('principal', $1, now())
       ON CONFLICT (id) DO UPDATE SET janela_minutos = excluded.janela_minutos`,
      [janela],
    );
    await administrador.query(`DELETE FROM ${nome}.tentativas_entrada`);
  }
});

afterAll(async () => {
  await Promise.all([...clientes.values()].map((cliente) => cliente.$disconnect()));
  globalComBanco.prisma = prismaAnterior;
  if (administrador) {
    try {
      for (const schema of schemasCriados) {
        await administrador.query(`DROP SCHEMA ${identificador(schema)} CASCADE`);
      }
    } finally {
      await administrador.end();
    }
  }
});

describe("Preview em schema do mesmo banco", () => {
  it("mantém clientes simultâneos isolados e executa o upsert usado na entrada", async () => {
    const preview = selecionarRuntime(schemaPreview);
    const controle = selecionarRuntime(schemaControle);
    const [parametrosPreview, parametrosControle] = await Promise.all([
      preview.parametrosAcesso.findUnique({ where: { id: "principal" } }),
      controle.parametrosAcesso.findUnique({ where: { id: "principal" } }),
    ]);
    // A leitura confirma o destino antes de qualquer escrita pelo runtime.
    expect(parametrosPreview?.janelaMinutos).toBe(21);
    expect(parametrosControle?.janelaMinutos).toBe(22);
    selecionarRuntime(schemaPreview);
    expect((await lerParametrosAcesso()).janelaMinutos).toBe(21);
    await preview.parametrosAcesso.delete({ where: { id: "principal" } });
    expect((await lerParametrosAcesso()).janelaMinutos).toBe(15);
    expect(
      (await controle.parametrosAcesso.findUnique({ where: { id: "principal" } }))?.janelaMinutos,
    ).toBe(22);
  });

  it("conta e limpa tentativas somente no schema selecionado", async () => {
    for (const schema of [schemaPreview, schemaControle]) {
      const cliente = selecionarRuntime(schema);
      const janela = schema === schemaPreview ? 21 : 22;
      expect(
        (await cliente.parametrosAcesso.findUnique({ where: { id: "principal" } }))?.janelaMinutos,
      ).toBe(janela);
      expect(objetoDoBanco("tentativas_entrada").sql).toBe(
        `${identificador(schema)}."tentativas_entrada"`,
      );
      expect(await limiteDeTentativas("QA mesma chave", 1)).toBe(true);
      expect(await limiteDeTentativas("QA mesma chave", 1)).toBe(false);
    }
    selecionarRuntime(schemaPreview);
    await limparTentativas("QA mesma chave");
    expect(await limiteDeTentativas("QA mesma chave", 1)).toBe(true);
    selecionarRuntime(schemaControle);
    expect(await limiteDeTentativas("QA mesma chave", 1)).toBe(false);
  });

  it("consulta tabelas e enum da planilha no schema próprio, incluindo maiúsculas e hífen", async () => {
    selecionarRuntime(schemaPreview);
    expect((await lerEstadoPlanilha()).alteradasDepois).toBe(1);
    selecionarRuntime(schemaControle);
    expect((await lerEstadoPlanilha()).alteradasDepois).toBe(2);
    selecionarRuntime(schemaPreview);
    expect((await lerEstadoPlanilha()).alteradasDepois).toBe(1);
  });

  it("falha em schema inexistente sem recorrer às tabelas do schema padrão", async () => {
    const cliente = selecionarRuntime(schemaAusente);
    await expect(
      cliente.parametrosAcesso.findUnique({ where: { id: "principal" } }),
    ).rejects.toMatchObject({ code: "P2021" });
    expect(objetoDoBanco("tentativas_entrada").sql).toBe(
      `${identificador(schemaAusente)}."tentativas_entrada"`,
    );
    await expect(limiteDeTentativas("QA schema ausente")).rejects.toMatchObject({ code: "P2010" });
  });

  it("dá precedência à variável DATABASE_SCHEMA sobre o schema da URL", () => {
    selecionarRuntime(schemaPreview);
    const anterior = process.env.DATABASE_SCHEMA;
    process.env.DATABASE_SCHEMA = schemaControle;
    try {
      expect(objetoDoBanco("tentativas_entrada").sql).toBe(
        `${identificador(schemaControle)}."tentativas_entrada"`,
      );
    } finally {
      if (anterior === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = anterior;
    }
    expect(objetoDoBanco("tentativas_entrada").sql).toBe(
      `${identificador(schemaPreview)}."tentativas_entrada"`,
    );
  });
});
