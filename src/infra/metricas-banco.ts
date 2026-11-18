// Coletas de banco e da fila de planilhas para o registro Prometheus,
// com falhas isoladas por coletor e sem dados de aluno em labels.
import { Counter, Gauge, Histogram } from "@prometheus-io/client";
import type { EstadoItemFila } from "@/domain/fila-planilha";
import { metricas } from "@/infra/metricas";

const ESTADOS_DA_FILA: readonly EstadoItemFila[] = [
  "AGUARDANDO",
  "EM_ANDAMENTO",
  "FALHOU",
  "CONCLUIDO",
  "DESCARTADO",
];

const globalComMetricasDoBanco = globalThis as unknown as {
  __frequenciappMetricasDoBanco?: boolean;
};

/** Contadores do pool do driver pg, lidos a cada coleta. */
export interface PoolDeConexoes {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
}

/** Consultas mínimas da fila de planilhas, sem expor o cliente Prisma. */
export interface FilaDePlanilhas {
  contarPorEstado(): Promise<readonly { estado: EstadoItemFila; quantidade: number }[]>;
  maisAntigaAberta(): Promise<Date | null>;
}

/** Fonte estrutural montada em banco.ts com o pool, a fila e o evento de consulta. */
export interface FonteDeMetricasDoBanco {
  pool: PoolDeConexoes;
  fila: FilaDePlanilhas;
  assinarConsulta(ouvinte: (duracaoMilissegundos: number) => void): void;
}

/** Registra as métricas de banco e fila uma única vez por processo. */
export function registrarMetricasDoBanco(fonte: FonteDeMetricasDoBanco): void {
  if (globalComMetricasDoBanco.__frequenciappMetricasDoBanco) return;
  globalComMetricasDoBanco.__frequenciappMetricasDoBanco = true;

  const { registro } = metricas();

  const erros = new Counter({
    name: "frequenciapp_coleta_erros_total",
    help: "Falhas de coleta por coletor.",
    labelNames: ["coletor"] as const,
    registers: [registro],
  });

  const duracaoDaColeta = new Gauge({
    name: "frequenciapp_coleta_duracao_seconds",
    help: "Duração da coleta por coletor, em segundos.",
    labelNames: ["coletor"] as const,
    registers: [registro],
  });

  const duracaoDaConsulta = new Histogram({
    name: "frequenciapp_db_query_duration_seconds",
    help: "Duração das consultas ao banco, em segundos.",
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registro],
  });

  const conexoes = new Gauge({
    name: "frequenciapp_db_pool_connections",
    help: "Conexões do pool do banco por estado.",
    labelNames: ["state"] as const,
    registers: [registro],
    collect: () => {
      const inicio = performance.now();
      try {
        const total = Math.max(0, fonte.pool.totalCount);
        const idle = Math.max(0, fonte.pool.idleCount);
        const waiting = Math.max(0, fonte.pool.waitingCount);
        conexoes.set({ state: "total" }, total);
        conexoes.set({ state: "idle" }, idle);
        conexoes.set({ state: "in_use" }, Math.max(0, total - idle));
        conexoes.set({ state: "waiting" }, waiting);
      } catch {
        erros.inc({ coletor: "pool" });
      } finally {
        duracaoDaColeta.set({ coletor: "pool" }, (performance.now() - inicio) / 1000);
      }
    },
  });

  const filaMaisAntiga = new Gauge({
    name: "frequenciapp_fila_planilha_mais_antiga_timestamp_seconds",
    help: "Criação do item aberto mais antigo da fila, em segundos Unix; zero quando vazia.",
    registers: [registro],
    collect: async () => {
      const dados = await coletarFila();
      if (dados) {
        filaMaisAntiga.set(dados.maisAntiga ? dados.maisAntiga.getTime() / 1000 : 0);
      }
    },
  });

  const itensDaFila = new Gauge({
    name: "frequenciapp_fila_planilha_itens",
    help: "Itens da fila de planilhas por estado.",
    labelNames: ["estado"] as const,
    registers: [registro],
    collect: async () => {
      const dados = await coletarFila();
      if (!dados) return;
      for (const estado of ESTADOS_DA_FILA) {
        itensDaFila.set({ estado }, dados.contagens.get(estado) ?? 0);
      }
    },
  });

  interface DadosDaFila {
    contagens: Map<EstadoItemFila, number>;
    maisAntiga: Date | null;
  }

  let coletaDaFila: Promise<DadosDaFila | null> | null = null;

  /** Uma consulta por raspagem, compartilhada pelos dois gauges da fila. */
  function coletarFila(): Promise<DadosDaFila | null> {
    coletaDaFila ??= lerFila().finally(() => {
      coletaDaFila = null;
    });
    return coletaDaFila;
  }

  async function lerFila(): Promise<DadosDaFila | null> {
    const inicio = performance.now();
    try {
      const contagens = new Map<EstadoItemFila, number>();
      for (const grupo of await fonte.fila.contarPorEstado()) {
        if (ESTADOS_DA_FILA.includes(grupo.estado)) {
          contagens.set(grupo.estado, grupo.quantidade);
        }
      }
      const maisAntiga = await fonte.fila.maisAntigaAberta();
      return { contagens, maisAntiga };
    } catch {
      erros.inc({ coletor: "fila" });
      return null;
    } finally {
      duracaoDaColeta.set({ coletor: "fila" }, (performance.now() - inicio) / 1000);
    }
  }

  fonte.assinarConsulta((duracaoMilissegundos) => {
    const segundos =
      Number.isFinite(duracaoMilissegundos) && duracaoMilissegundos >= 0
        ? duracaoMilissegundos / 1000
        : 0;
    duracaoDaConsulta.observe(segundos);
  });
}
