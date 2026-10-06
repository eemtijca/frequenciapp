// Cliente Prisma compartilhado. Uma ligação por processo, via
// adaptador pg (driver oficial do PostgreSQL para Node).
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ambiente } from "@/infra/ambiente";
import { identificadorPostgres, resolverSchema } from "./schema-postgres.mjs";

const globalComBanco = globalThis as unknown as {
  // Reaproveita a instância entre recarregamentos do servidor em dev.
  prisma?: PrismaClient;
};

/** Schema efetivo do processo: DATABASE_SCHEMA vence o parâmetro da URL. */
function schemaDoBanco(): string {
  return resolverSchema({
    url: ambiente.databaseUrl,
    schemaExplicito: process.env.DATABASE_SCHEMA,
  });
}

function criarCliente(): PrismaClient {
  // Instâncias serverless usam pool de uma conexão (POOL_MAX_CONEXOES=1);
  // ambientes persistentes podem ampliar conforme a demanda observada.
  const adaptador = new PrismaPg(
    { connectionString: ambiente.databaseUrl, max: ambiente.poolMaxConexoes },
    { schema: schemaDoBanco() },
  );
  return new PrismaClient({ adapter: adaptador, log: ["warn", "error"] });
}

/** Qualifica tabelas e tipos do SQL direto sem depender da sessão do pooler. */
export function objetoDoBanco(nome: string): Prisma.Sql {
  const schema = schemaDoBanco();
  return Prisma.raw(`${identificadorPostgres(schema)}.${identificadorPostgres(nome)}`);
}

/** Cliente pronto. Reaproveita a ligação por processo. */
export function banco(): PrismaClient {
  globalComBanco.prisma ??= criarCliente();
  return globalComBanco.prisma;
}

export type Banco = PrismaClient;
