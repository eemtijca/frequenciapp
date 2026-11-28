// Ensaio do transporte BullMQ: publicação, jobId determinístico e consumo.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Worker } from "bullmq";
import type { Trabalho } from "../../../generated/prisma/client";
import {
  FILA_TRABALHOS,
  PREFIXO_FILA,
  conexaoWorker,
  fecharFilas,
  filaDeTrabalhos,
  publicarTrabalho,
} from "@/infra/fila/bullmq";

const recebidos: string[] = [];

function exigirPrefixoDeTeste(): void {
  if (!PREFIXO_FILA.includes("teste")) {
    throw new Error("A limpeza exige um prefixo Redis de teste, por exemplo {frequenciapp-teste}.");
  }
}

async function esperar(condicao: () => boolean, tempoMs = 10_000): Promise<void> {
  const limite = Date.now() + tempoMs;
  while (Date.now() < limite) {
    if (condicao()) return;
    await new Promise((resolver) => setTimeout(resolver, 50));
  }
  throw new Error("O job não foi consumido no prazo.");
}

beforeAll(async () => {
  exigirPrefixoDeTeste();
  await filaDeTrabalhos().obliterate({ force: true });
});

afterAll(async () => {
  if (PREFIXO_FILA.includes("teste")) {
    await filaDeTrabalhos()
      .obliterate({ force: true })
      .catch(() => undefined);
  }
  await fecharFilas();
});

describe("transporte BullMQ", () => {
  it("publica um trabalho com jobId determinístico e consome", async () => {
    const id = randomUUID();
    const trabalho = {
      id,
      tipo: "EXPURGO_TRABALHOS",
      chaveIdempotencia: "0".repeat(64),
      estado: "PENDENTE",
      prioridade: 100,
      payload: {},
      tentativas: 0,
      maxTentativas: 5,
      disponivelEm: new Date(),
      reservadoAte: null,
      reservadoPor: null,
      reservaId: null,
      resultado: null,
      detalhes: null,
      erroCodigo: null,
      erroResumo: null,
      origem: "sistema",
      autorId: null,
      despachadoEm: null,
      tentativasDespacho: 0,
      proximoDespachoEm: null,
      erroDespacho: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      concluidoEm: null,
    } as unknown as Trabalho;

    await publicarTrabalho(trabalho);
    const job = await filaDeTrabalhos().getJob(`trabalho:${id}:0`);
    expect(job?.data).toEqual({ trabalhoId: id });

    const worker = new Worker(
      FILA_TRABALHOS,
      async (job) => {
        recebidos.push(job.data.trabalhoId);
        return { ok: true };
      },
      { connection: conexaoWorker(), prefix: PREFIXO_FILA, concurrency: 1 },
    );
    await esperar(() => recebidos.includes(id));
    await worker.close();
    expect(recebidos).toContain(id);
  });
});
