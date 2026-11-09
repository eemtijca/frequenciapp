// Exercita a seleção real do runtime sem construir adaptadores ou clientes de banco reais.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/client";

const f = vi.hoisted(() => ({
  configuracao: { databaseUrl: "" },
  adaptador: vi.fn(),
  cliente: vi.fn(),
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: f.configuracao }));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: function (...argumentos: unknown[]) {
    f.adaptador(...argumentos);
  },
}));
vi.mock("../../../generated/prisma/client", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../../../generated/prisma/client")>();
  return {
    ...original,
    PrismaClient: function (...argumentos: unknown[]) {
      f.cliente(...argumentos);
    },
  };
});

import { banco, objetoDoBanco } from "@/infra/banco";
import { criarAmbienteSchemaPreview } from "../../helpers/schema-preview-ambiente";

const conexao = "postgresql://qa:senha-sintetica@127.0.0.1:5432/qa_exclusivo?schema=public";
const schemaPreview = "QA_preview_unidade";
const schemaControle = "QA_controle-unidade";
const globalComBanco = globalThis as unknown as { prisma?: PrismaClient };

beforeEach(() => {
  vi.stubEnv("DATABASE_SCHEMA", "public");
  vi.stubEnv("DATABASE_URL", conexao);
  vi.stubEnv("DIRECT_URL", conexao);
  vi.stubGlobal("prisma", undefined);
  f.configuracao.databaseUrl = conexao;
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ambiente da regressão de schema Preview", () => {
  it("seleciona o schema descartável apesar de DATABASE_SCHEMA=public herdado do executor", () => {
    const clientes = new Map<string, PrismaClient>();
    const ambiente = criarAmbienteSchemaPreview(conexao, schemaControle, f.configuracao, clientes);
    try {
      const preview = ambiente.selecionar(schemaPreview);
      expect(f.adaptador).toHaveBeenLastCalledWith(
        expect.objectContaining({ connectionString: f.configuracao.databaseUrl }),
        { schema: schemaPreview },
      );
      expect(objetoDoBanco("tentativas_entrada").sql).toBe(
        '"QA_preview_unidade"."tentativas_entrada"',
      );
      const controle = ambiente.selecionar(schemaControle);
      expect(controle).not.toBe(preview);
      expect(f.adaptador).toHaveBeenLastCalledWith(
        expect.objectContaining({ connectionString: f.configuracao.databaseUrl }),
        { schema: schemaControle },
      );
      expect(objetoDoBanco("tentativas_entrada").sql).toBe(
        '"QA_controle-unidade"."tentativas_entrada"',
      );
      expect(ambiente.selecionar(schemaPreview)).toBe(preview);
      expect(globalComBanco.prisma).toBe(preview);
      expect(process.env.DATABASE_SCHEMA).toBe(schemaPreview);
      expect(f.adaptador).toHaveBeenCalledTimes(2);
      expect(f.cliente).toHaveBeenCalledTimes(2);
      const esperada = new URL(conexao);
      esperada.searchParams.set("schema", schemaPreview);
      esperada.searchParams.set("options", '-c search_path="QA_controle-unidade"');
      expect(f.configuracao.databaseUrl).toBe(esperada.toString());
      expect(process.env.DATABASE_URL).toBe(conexao);
      expect(process.env.DIRECT_URL).toBe(conexao);
    } finally {
      ambiente.restaurar();
    }
    expect(process.env.DATABASE_SCHEMA).toBe("public");
    expect(f.configuracao.databaseUrl).toBe(conexao);
    expect(globalComBanco.prisma).toBeUndefined();
  });

  it.each([undefined, "", "public", "QA_herdado"])(
    "restaura schema %j, URL e cliente anteriores mesmo após erro assíncrono",
    async (schemaAnterior) => {
      vi.stubEnv("DATABASE_SCHEMA", schemaAnterior);
      const urlAnterior = `${conexao}&application_name=qa_original`;
      f.configuracao.databaseUrl = urlAnterior;
      const prismaAnterior = banco();
      const ambiente = criarAmbienteSchemaPreview(
        conexao,
        schemaControle,
        f.configuracao,
        new Map(),
      );
      const erro = new Error("Falha sintética durante o caso de teste.");
      await expect(
        (async () => {
          try {
            ambiente.selecionar(schemaPreview);
            expect(process.env.DATABASE_SCHEMA).toBe(schemaPreview);
            await Promise.resolve();
            throw erro;
          } finally {
            ambiente.restaurar();
          }
        })(),
      ).rejects.toBe(erro);
      expect(process.env.DATABASE_SCHEMA).toBe(schemaAnterior);
      expect(Object.hasOwn(process.env, "DATABASE_SCHEMA")).toBe(schemaAnterior !== undefined);
      expect(f.configuracao.databaseUrl).toBe(urlAnterior);
      expect(globalComBanco.prisma).toBe(prismaAnterior);
      expect(banco()).toBe(prismaAnterior);
      expect(process.env.DATABASE_URL).toBe(conexao);
      expect(process.env.DIRECT_URL).toBe(conexao);
    },
  );

  it("restaura o ambiente quando a criação do adaptador falha sem guardar cliente incompleto", () => {
    const prismaAnterior = banco();
    const clientes = new Map<string, PrismaClient>();
    const ambiente = criarAmbienteSchemaPreview(conexao, schemaControle, f.configuracao, clientes);
    const erro = new Error("Falha sintética ao criar o adaptador.");
    f.adaptador.mockImplementationOnce(() => {
      throw erro;
    });
    try {
      expect(() => ambiente.selecionar(schemaPreview)).toThrow(erro);
    } finally {
      ambiente.restaurar();
    }
    expect(clientes.size).toBe(0);
    expect(process.env.DATABASE_SCHEMA).toBe("public");
    expect(f.configuracao.databaseUrl).toBe(conexao);
    expect(globalComBanco.prisma).toBe(prismaAnterior);
  });

  it("isola casos consecutivos após falha e reaproveita somente o cliente do schema selecionado", async () => {
    const clientes = new Map<string, PrismaClient>();
    async function executarCaso(schema: string, erro?: Error) {
      expect(process.env.DATABASE_SCHEMA).toBe("public");
      expect(f.configuracao.databaseUrl).toBe(conexao);
      expect(globalComBanco.prisma).toBeUndefined();
      const ambiente = criarAmbienteSchemaPreview(
        conexao,
        schemaControle,
        f.configuracao,
        clientes,
      );
      try {
        const cliente = ambiente.selecionar(schema);
        expect(objetoDoBanco("tentativas_entrada").sql).toBe(`"${schema}"."tentativas_entrada"`);
        await Promise.resolve();
        if (erro) throw erro;
        return cliente;
      } finally {
        ambiente.restaurar();
      }
    }
    const erro = new Error("Falha sintética no primeiro caso.");
    await expect(executarCaso(schemaPreview, erro)).rejects.toBe(erro);
    const controle = await executarCaso(schemaControle);
    const preview = await executarCaso(schemaPreview);
    expect(preview).toBe(clientes.get(schemaPreview));
    expect(controle).toBe(clientes.get(schemaControle));
    expect(preview).not.toBe(controle);
    expect(clientes.size).toBe(2);
    expect(f.adaptador).toHaveBeenCalledTimes(2);
    expect(f.cliente).toHaveBeenCalledTimes(2);
    expect(process.env.DATABASE_SCHEMA).toBe("public");
    expect(f.configuracao.databaseUrl).toBe(conexao);
    expect(globalComBanco.prisma).toBeUndefined();
  });
});
