// Cliente Prisma compartilhado. Uma ligação por processo, via
// adaptador pg (driver oficial do PostgreSQL para Node).
import pg from "pg";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AsyncLocalStorage } from "node:async_hooks";
import type { EstadoItemFila } from "@/domain/fila-planilha";
import { ambiente } from "@/infra/ambiente";
import { registrarMetricasDoBanco, type AmostraDaFila } from "@/infra/metricas-banco";
import { identificadorPostgres, resolverSchema } from "./schema-postgres.mjs";

const globalComBanco = globalThis as unknown as {
  // Reaproveita a instância entre recarregamentos do servidor em dev.
  prisma?: PrismaClient;
};

// Itens abertos contam para a idade da fila e para o alerta de fila parada.
const ESTADOS_ABERTOS: EstadoItemFila[] = ["AGUARDANDO", "EM_ANDAMENTO", "FALHOU"];

// Orçamento da coleta da fila: o servidor cancela antes do cliente e a transação
// fecha antes do tempo limite de raspagem de 10 segundos.
const TEMPO_LIMITE_FILA_MS = 2_000;
const TEMPO_TRANSACAO_FILA_MS = 4_000;
const TEMPO_CONSULTA_POOL_MS = 8_000;

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
    // Proteção cliente: nenhuma consulta fica pendente além do orçamento da coleta.
    query_timeout: TEMPO_CONSULTA_POOL_MS,
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
      lerAmostra: () => lerAmostraDaFila(prisma),
    },
    assinarConsulta: (ouvinte) => {
      prisma.$on("query", (evento) => ouvinte(evento.duration));
    },
  });
  return prisma;
}

interface LinhaDaFila {
  estado: EstadoItemFila;
  quantidade: number;
  mais_antiga: Date | null;
}

/** Uma consulta agregada por amostra, com prazo de servidor e de transação. */
async function lerAmostraDaFila(prisma: PrismaClient): Promise<AmostraDaFila> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SET LOCAL statement_timeout = ${Prisma.raw(String(TEMPO_LIMITE_FILA_MS))}`,
      );
      const linhas = await tx.$queryRaw<LinhaDaFila[]>(Prisma.sql`
        SELECT contagens.estado, contagens.quantidade, abertos.mais_antiga
        FROM (
          SELECT estado, count(*)::int AS quantidade
          FROM ${objetoDoBanco("fila_planilha")}
          GROUP BY estado
        ) AS contagens
        CROSS JOIN (
          SELECT min(criado_em) AS mais_antiga
          FROM ${objetoDoBanco("fila_planilha")}
          WHERE estado IN (${Prisma.join(ESTADOS_ABERTOS)})
        ) AS abertos
      `);
      const contagens = new Map<EstadoItemFila, number>();
      let maisAntiga: Date | null = null;
      for (const linha of linhas) {
        contagens.set(linha.estado, linha.quantidade);
        if (!maisAntiga && linha.mais_antiga) maisAntiga = linha.mais_antiga;
      }
      return { contagens, maisAntiga };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 1_000,
      timeout: TEMPO_TRANSACAO_FILA_MS,
    },
  );
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
