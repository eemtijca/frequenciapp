// Cliente Prisma compartilhado. Uma ligação por processo, via
// adaptador pg (driver oficial do PostgreSQL para Node).
import pg from "pg";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AsyncLocalStorage } from "node:async_hooks";
import type { EstadoItemFila } from "@/domain/fila-planilha";
import { ambiente } from "@/infra/ambiente";
import { registrarMetricasDoBanco } from "@/infra/metricas-banco";
import { identificadorPostgres, resolverSchema } from "./schema-postgres.mjs";

const globalComBanco = globalThis as unknown as {
  // Reaproveita a instância entre recarregamentos do servidor em dev.
  prisma?: PrismaClient;
};

// Itens abertos contam para a idade da fila e para o alerta de fila parada.
const ESTADOS_ABERTOS: EstadoItemFila[] = ["AGUARDANDO", "EM_ANDAMENTO", "FALHOU"];

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
  const pool = new pg.Pool({
    connectionString: ambiente.databaseUrl,
    max: ambiente.poolMaxConexoes,
  });
  const adaptador = new PrismaPg(pool, {
    schema: schemaDoBanco(),
    disposeExternalPool: true,
  });
  const prisma = new PrismaClient({
    adapter: adaptador,
    log: ["warn", "error", { emit: "event", level: "query" }],
  });
  registrarMetricasDoBanco({
    pool,
    fila: {
      contarPorEstado: async () => {
        const grupos = await prisma.filaPlanilha.groupBy({
          by: ["estado"],
          _count: { _all: true },
        });
        return grupos.map((grupo) => ({
          estado: grupo.estado,
          quantidade: grupo._count._all,
        }));
      },
      maisAntigaAberta: async () => {
        const item = await prisma.filaPlanilha.findFirst({
          where: { estado: { in: ESTADOS_ABERTOS } },
          orderBy: { criadoEm: "asc" },
          select: { criadoEm: true },
        });
        return item?.criadoEm ?? null;
      },
    },
    assinarConsulta: (ouvinte) => {
      prisma.$on("query", (evento) => ouvinte(evento.duration));
    },
  });
  return prisma;
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
