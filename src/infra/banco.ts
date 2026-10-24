// Cliente Prisma compartilhado. Uma ligação por processo, via
// adaptador pg (driver oficial do PostgreSQL para Node).
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { ambiente } from "@/infra/ambiente";
import { identificadorPostgres, resolverSchema } from "./schema-postgres.mjs";

const globalComBanco = globalThis as unknown as {
  // Reaproveita a instância entre recarregamentos do servidor em dev.
  prisma?: PrismaClient;
};

// Permite que um lote reutilize a mesma transação sem abrir outra conexão.
const contextoTransacao = new AsyncLocalStorage<Prisma.TransactionClient>();

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

/** Cliente pronto. Reaproveita a ligação por processo ou a transação corrente. */
export function banco(): PrismaClient {
  const transacao = contextoTransacao.getStore();
  if (transacao) return transacao as unknown as PrismaClient;
  globalComBanco.prisma ??= criarCliente();
  return globalComBanco.prisma;
}

/** Executa a função com todas as chamadas de banco dentro da transação informada. */
export function usarTransacao<T>(
  transacao: Prisma.TransactionClient,
  operacao: () => Promise<T>,
): Promise<T> {
  return contextoTransacao.run(transacao, operacao);
}

/** Transação já aberta neste contexto, quando houver. */
export function transacaoCorrente(): Prisma.TransactionClient | undefined {
  return contextoTransacao.getStore();
}

export type Banco = PrismaClient;
