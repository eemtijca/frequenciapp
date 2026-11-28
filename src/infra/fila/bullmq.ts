// Conexões e filas BullMQ. O PostgreSQL continua sendo a fonte da verdade;
// o Redis recebe apenas identificadores e serve de transporte e temporizador.
import { Queue, type ConnectionOptions } from "bullmq";
import type { Trabalho } from "../../../generated/prisma/client";
import { ambiente } from "@/infra/ambiente";

export const PREFIXO_FILA = ambiente.fila?.prefixo ?? "{frequenciapp}";
export const FILA_TRABALHOS = "trabalhos";
export const FILA_PLANILHA = "planilha";

const globalComFilas = globalThis as unknown as {
  __frequenciappFilaTrabalhos?: Queue;
  __frequenciappFilaPlanilha?: Queue;
};

function opcoesDaUrl(
  url: string,
  extras: { maxRetriesPerRequest: number | null; enableOfflineQueue: boolean },
): ConnectionOptions {
  const parsed = new URL(url);
  const porta = parsed.port ? Number(parsed.port) : 6379;
  const banco = parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: Number.isInteger(porta) ? porta : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(Number.isInteger(banco) && banco > 0 ? { db: banco } : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    ...extras,
  };
}

function urlDoRedis(): string {
  if (!ambiente.fila.redisUrl) throw new Error("REDIS_URL não está configurada.");
  return ambiente.fila.redisUrl;
}

/** Produtor falha rápido quando o Redis está indisponível. */
export function conexaoProdutor(): ConnectionOptions {
  return opcoesDaUrl(urlDoRedis(), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

/** Consumidor espera e reconecta enquanto o Redis estiver fora. */
export function conexaoWorker(): ConnectionOptions {
  return opcoesDaUrl(urlDoRedis(), {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
  });
}

export function filaDeTrabalhos(): Queue {
  globalComFilas.__frequenciappFilaTrabalhos ??= new Queue(FILA_TRABALHOS, {
    connection: conexaoProdutor(),
    prefix: PREFIXO_FILA,
  });
  return globalComFilas.__frequenciappFilaTrabalhos;
}

export function filaDePlanilhas(): Queue {
  globalComFilas.__frequenciappFilaPlanilha ??= new Queue(FILA_PLANILHA, {
    connection: conexaoProdutor(),
    prefix: PREFIXO_FILA,
  });
  return globalComFilas.__frequenciappFilaPlanilha;
}

/** Publica um trabalho genérico. O jobId inclui a tentativa para permitir reagendamento. */
export async function publicarTrabalho(trabalho: Trabalho): Promise<void> {
  const delay = Math.max(0, trabalho.disponivelEm.getTime() - Date.now());
  await filaDeTrabalhos().add(
    "trabalho",
    { trabalhoId: trabalho.id },
    {
      jobId: `trabalho:${trabalho.id}:${trabalho.tentativas}`,
      delay,
      attempts: 1,
      priority: trabalho.prioridade,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/**
 * Publica a cabeça da fila de planilhas com o atraso da próxima tentativa.
 * O terceiro segmento do jobId nunca contém dois-pontos: o BullMQ aceita
 * exatamente três partes em um identificador personalizado.
 */
export async function publicarPlanilha(
  id: string,
  chaveDaTentativa: string,
  delayMs: number,
): Promise<void> {
  await filaDePlanilhas().add(
    "planilha",
    { filaId: id },
    {
      jobId: `planilha:${id}:${chaveDaTentativa}`,
      delay: Math.max(0, delayMs),
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/** Fecha as filas do processo. O worker usa no encerramento gracioso. */
export async function fecharFilas(): Promise<void> {
  const filas = [
    globalComFilas.__frequenciappFilaTrabalhos,
    globalComFilas.__frequenciappFilaPlanilha,
  ];
  globalComFilas.__frequenciappFilaTrabalhos = undefined;
  globalComFilas.__frequenciappFilaPlanilha = undefined;
  await Promise.allSettled(
    filas.filter((fila): fila is Queue => Boolean(fila)).map((fila) => fila.close()),
  );
}
