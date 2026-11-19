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

/** Duas raspagens próximas reutilizam a última leitura válida da fila. */
const VALIDADE_DA_AMOSTRA_MS = 15_000;

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
export interface AmostraDaFila {
  contagens: ReadonlyMap<EstadoItemFila, number>;
  maisAntiga: Date | null;
}

export interface FilaDePlanilhas {
  lerAmostra(): Promise<AmostraDaFila>;
}

/** Fonte estrutural montada em banco.ts com o pool, a fila e o evento de consulta. */
export interface FonteDeMetricasDoBanco {
  pool: PoolDeConexoes;
  fila: FilaDePlanilhas;
  assinarConsulta(ouvinte: (duracaoMilissegundos: number) => void): void;
  /** Relógio da validade da amostra; o padrão é o relógio do processo. */
  agora?: () => number;
}

/** Registra as métricas de banco e fila uma única vez por processo. */
export function registrarMetricasDoBanco(fonte: FonteDeMetricasDoBanco): void {
  if (globalComMetricasDoBanco.__frequenciappMetricasDoBanco) return;
  globalComMetricasDoBanco.__frequenciappMetricasDoBanco = true;

  const { registro } = metricas();
  const agora = fonte.agora ?? Date.now;

  const erros = new Counter({
    name: "frequenciapp_coleta_erros_total",
    help: "Falhas de coleta por coletor.",
    labelNames: ["coletor"] as const,
    registers: [registro],
    collect: async () => {
      // A falha da fila entra no mesmo texto que a raspagem que a provocou.
      await coletarFila();
    },
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
      if (!dados) return;
      filaMaisAntiga.set(dados.maisAntiga ? dados.maisAntiga.getTime() / 1000 : 0);
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

  const filaAtualizada = new Gauge({
    name: "frequenciapp_fila_planilha_atualizado_timestamp_seconds",
    help: "Instante da última leitura válida da fila de planilhas, em segundos Unix.",
    registers: [registro],
    collect: async () => {
      // A raspagem que inicia a leitura espera a amostra para publicar o carimbo novo.
      await coletarFila();
    },
  });

  let amostraDaFila: AmostraDaFila | null = null;
  let amostraEm = 0;
  let coletaDaFila: Promise<AmostraDaFila | null> | null = null;

  /** Amostra compartilhada enquanto estiver dentro da validade curta. */
  function amostraValida(instante: number): AmostraDaFila | null {
    if (!amostraDaFila) return null;
    const idade = instante - amostraEm;
    return idade >= 0 && idade < VALIDADE_DA_AMOSTRA_MS ? amostraDaFila : null;
  }

  /** Uma consulta por amostra, compartilhada pelas séries da fila e por raspagens próximas. */
  function coletarFila(): Promise<AmostraDaFila | null> {
    const atual = amostraValida(agora());
    if (atual) return Promise.resolve(atual);
    coletaDaFila ??= lerFila().finally(() => {
      coletaDaFila = null;
    });
    return coletaDaFila;
  }

  async function lerFila(): Promise<AmostraDaFila | null> {
    const inicio = performance.now();
    try {
      const dados = await fonte.fila.lerAmostra();
      const lidoEm = agora();
      amostraDaFila = dados;
      amostraEm = lidoEm;
      filaAtualizada.set(lidoEm / 1000);
      return dados;
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
