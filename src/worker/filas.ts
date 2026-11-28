// Host do worker: filas BullMQ, reconciliador periódico e encerramento gracioso.
import { Worker } from "bullmq";
import { ambiente } from "@/infra/ambiente";
import {
  FILA_PLANILHA,
  FILA_TRABALHOS,
  PREFIXO_FILA,
  conexaoWorker,
  fecharFilas,
  filaDeTrabalhos,
  publicarTrabalho,
} from "@/infra/fila/bullmq";
import { publicarCabecaDaFila } from "@/infra/fila/planilha";
import {
  despacharTrabalhosPendentes,
  executarTrabalhos,
  identificadorDoWorker,
  type RegistroDeManipuladores,
} from "@/application/fila-trabalhos";
import { processarFila } from "@/application/fila-planilha";
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";

const WORKER_ID = identificadorDoWorker();

async function reconciliar(): Promise<void> {
  await despacharIntencoesEscolares().catch((erro) => {
    console.error(
      "[worker] falha ao despachar intenções",
      erro instanceof Error ? erro.name : "erro",
    );
  });
  await despacharTrabalhosPendentes(publicarTrabalho).catch((erro) => {
    console.error(
      "[worker] falha ao despachar trabalhos",
      erro instanceof Error ? erro.name : "erro",
    );
  });
  await publicarCabecaDaFila().catch((erro) => {
    console.error(
      "[worker] falha ao publicar cabeça da fila",
      erro instanceof Error ? erro.name : "erro",
    );
  });
}

export interface Workers {
  encerrar: () => Promise<void>;
}

export async function iniciarWorkers(manipuladores: RegistroDeManipuladores): Promise<Workers> {
  const opcoesComuns = {
    connection: conexaoWorker(),
    prefix: PREFIXO_FILA,
    lockDuration: 600_000,
    stalledInterval: 30_000,
    maxStalledCount: 2,
  } as const;

  const trabalhadorTrabalhos = new Worker(
    FILA_TRABALHOS,
    async (job) => {
      if (job.name === "reconciliar") {
        await reconciliar();
        await executarTrabalhos(manipuladores, {
          limite: 5,
          workerId: WORKER_ID,
          timeoutMs: ambiente.fila.workerTimeout * 1_000,
        });
        await reconciliar();
        return { reconciliado: true };
      }
      await executarTrabalhos(manipuladores, {
        limite: 1,
        workerId: WORKER_ID,
        timeoutMs: ambiente.fila.workerTimeout * 1_000,
      });
      await reconciliar();
      return { processado: true };
    },
    {
      ...opcoesComuns,
      concurrency: Math.max(1, Math.min(2, ambiente.fila.workerConcorrencia)),
    },
  );

  const trabalhadorPlanilhas = new Worker(
    FILA_PLANILHA,
    async () => {
      await processarFila({ limite: 10, workerId: WORKER_ID });
      await publicarCabecaDaFila();
      return { processado: true };
    },
    {
      ...opcoesComuns,
      concurrency: ambiente.fila.workerPlanilhaConcorrencia,
    },
  );

  for (const trabalhador of [trabalhadorTrabalhos, trabalhadorPlanilhas]) {
    trabalhador.on("error", (erro) => {
      console.error("[worker] erro de fila", erro instanceof Error ? erro.name : "erro");
    });
    trabalhador.on("failed", (job, erro) => {
      console.error(`[worker] job ${job?.id ?? "desconhecido"} falhou: ${erro.name}`);
    });
  }

  await filaDeTrabalhos().upsertJobScheduler(
    "reconciliar-fila",
    { every: 60_000 },
    {
      name: "reconciliar",
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    },
  );
  await reconciliar();

  return {
    encerrar: async () => {
      await Promise.allSettled([trabalhadorTrabalhos.close(), trabalhadorPlanilhas.close()]);
      await fecharFilas();
    },
  };
}
