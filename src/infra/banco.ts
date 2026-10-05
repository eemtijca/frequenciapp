// Cliente Prisma compartilhado. Uma ligação por processo, via
// adaptador pg (driver oficial do PostgreSQL para Node).
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ambiente } from "@/infra/ambiente";
import { identificadorPostgres, schemaDaConexao } from "./schema-postgres.mjs";

const globalComBanco = globalThis as unknown as {
  // Reaproveita a instância entre recarregamentos do servidor em dev.
  prisma?: PrismaClient;
};

function criarCliente(): PrismaClient {
  // O Supabase usa pool de transações no runtime. Instâncias serverless
  // começam com uma conexão e podem ser ajustadas após observar a demanda.
  const max = process.env.VERCEL ? 1 : 10;
  const adaptador = new PrismaPg(
    { connectionString: ambiente.databaseUrl, max },
    { schema: schemaDaConexao(ambiente.databaseUrl) },
  );
  return new PrismaClient({ adapter: adaptador, log: ["warn", "error"] });
}

/** Qualifica tabelas e tipos do SQL direto sem depender da sessão do pooler. */
export function objetoDoBanco(nome: string): Prisma.Sql {
  const schema = schemaDaConexao(ambiente.databaseUrl);
  return Prisma.raw(`${identificadorPostgres(schema)}.${identificadorPostgres(nome)}`);
}

/** Cliente pronto. Reaproveita a ligação por processo. */
export function banco(): PrismaClient {
  globalComBanco.prisma ??= criarCliente();
  return globalComBanco.prisma;
}

export type Banco = PrismaClient;
