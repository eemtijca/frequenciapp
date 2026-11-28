// Host do worker: filas BullMQ, reconciliador periódico, agendas e encerramento
// gracioso. Cada fila só sobe quando o transporte e a flag correspondentes estão ativos.
import { Worker } from "bullmq";
import { ambiente } from "@/infra/ambiente";
import {
  FILA_PLANILHA,
  FILA_TRABALHOS,
  PREFIXO_FILA,
  conexaoWorker,
  fecharFilas,
  filaDePlanilhas,
  filaDeTrabalhos,
  publicarTrabalho,
} from "@/infra/fila/bullmq";
import { publicarCabecaDaFila } from "@/infra/fila/planilha";
import {
  despacharTrabalhosPendentes,
  enfileirarTrabalho,
  executarTrabalhos,
  identificadorDoWorker,
  recuperarTrabalhosVencidos,
  type RegistroDeManipuladores,
} from "@/application/fila-trabalhos";
import { processarFila } from "@/application/fila-planilha";
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";
import { diaLocal } from "@/domain/frequencia";
import { filasAtivas, janelaDeCincoMinutos, type TipoTrabalho } from "@/domain/trabalho";
import { comTransacao } from "@/infra/transacoes";

const WORKER_ID = identificadorDoWorker();
const INTERVALO_RECONCILIACAO_MS = 60_000;
const INTERVALO_INDICADORES_MS = 300_000;

const ATIVAS = filasAtivas(ambiente.fila);

async function reconciliar(): Promise<void> {
  if (ATIVAS.trabalhos) {
    await recuperarTrabalhosVencidos().catch((erro) => {
      console.error(
        "[worker] falha ao recuperar reservas vencidas",
        erro instanceof Error ? erro.name : "erro",
      );
    });
    await despacharTrabalhosPendentes(publicarTrabalho).catch((erro) => {
      console.error(
        "[worker] falha ao despachar trabalhos",
        erro instanceof Error ? erro.name : "erro",
      );
    });
  }
  if (ATIVAS.planilha) {
    await despacharIntencoesEscolares().catch((erro) => {
      console.error(
        "[worker] falha ao despachar intenções",
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
}

async function executarAgendado(
  tipo: TipoTrabalho,
  payload: unknown,
  manipuladores: RegistroDeManipuladores,
): Promise<void> {
  await comTransacao((tx) => enfileirarTrabalho(tx, { tipo, payload, origem: "agenda" }));
  await despacharTrabalhosPendentes(publicarTrabalho);
  await executarTrabalhos(manipuladores, {
    limite: 1,
    workerId: WORKER_ID,
    timeoutMs: ambiente.fila.workerTimeout * 1_000,
  });
}

export interface Workers {
  encerrar: () => Promise<void>;
}

export async function iniciarWorkers(manipuladores: RegistroDeManipuladores): Promise<Workers> {
  const trabalhadores: Worker[] = [];

  if (ATIVAS.trabalhos || ATIVAS.planilha) {
    const opcoesComuns = {
      connection: conexaoWorker(),
      prefix: PREFIXO_FILA,
      lockDuration: 600_000,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    } as const;

    if (ATIVAS.trabalhos) {
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
          if (job.name === "indicadores") {
            await executarAgendado(
              "INDICADORES_ATUALIZAR",
              { janela: janelaDeCincoMinutos(new Date()) },
              manipuladores,
            );
            return { agendado: true };
          }
          if (job.name === "expurgo") {
            await executarAgendado(
              "EXPURGO_TRABALHOS",
              { dia: diaLocal(new Date(), ambiente.fuso) },
              manipuladores,
            );
            return { agendado: true };
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
      trabalhadores.push(trabalhadorTrabalhos);
    }

    if (ATIVAS.planilha) {
      const trabalhadorPlanilhas = new Worker(
        FILA_PLANILHA,
        async (job) => {
          if (job.name === "reconciliar") {
            await reconciliar();
            return { reconciliado: true };
          }
          await processarFila({ limite: 10, workerId: WORKER_ID });
          await publicarCabecaDaFila();
          return { processado: true };
        },
        {
          ...opcoesComuns,
          concurrency: ambiente.fila.workerPlanilhaConcorrencia,
        },
      );
      trabalhadores.push(trabalhadorPlanilhas);
    }
  }

  for (const trabalhador of trabalhadores) {
    trabalhador.on("error", (erro) => {
      console.error("[worker] erro de fila", erro instanceof Error ? erro.name : "erro");
    });
    trabalhador.on("failed", (job, erro) => {
      console.error(`[worker] job ${job?.id ?? "desconhecido"} falhou: ${erro.name}`);
    });
  }

  if (ATIVAS.trabalhos) {
    await filaDeTrabalhos().upsertJobScheduler(
      "reconciliar-fila",
      { every: INTERVALO_RECONCILIACAO_MS },
      {
        name: "reconciliar",
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );
    await filaDeTrabalhos().upsertJobScheduler(
      "indicadores-fila",
      { every: INTERVALO_INDICADORES_MS },
      {
        name: "indicadores",
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );
    await filaDeTrabalhos().upsertJobScheduler(
      "expurgo-diario",
      { pattern: "0 3 * * *", tz: ambiente.fuso },
      {
        name: "expurgo",
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );
  } else if (ATIVAS.planilha) {
    await filaDePlanilhas().upsertJobScheduler(
      "reconciliar-fila",
      { every: INTERVALO_RECONCILIACAO_MS },
      {
        name: "reconciliar",
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );
  }

  if (ATIVAS.trabalhos || ATIVAS.planilha) await reconciliar();

  return {
    encerrar: async () => {
      await Promise.allSettled(trabalhadores.map((trabalhador) => trabalhador.close()));
      await fecharFilas();
    },
  };
}
