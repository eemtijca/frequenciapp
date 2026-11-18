// Coletas de banco e fila: pool, consultas, estados da fila e falhas isoladas.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EstadoItemFila } from "@/domain/fila-planilha";
import { metricas } from "@/infra/metricas";
import { registrarMetricasDoBanco, type FonteDeMetricasDoBanco } from "@/infra/metricas-banco";

const AGORA = new Date("2026-01-02T03:04:05.000Z");

const estado = {
  grupos: [] as { estado: EstadoItemFila; quantidade: number }[],
  maisAntiga: null as Date | null,
  falharFila: false,
  falharPool: false,
  ouvintes: [] as ((duracaoMilissegundos: number) => void)[],
};

const fonte: FonteDeMetricasDoBanco = {
  pool: {
    get totalCount() {
      if (estado.falharPool) throw new Error("falha sintética do pool");
      return 7;
    },
    get idleCount() {
      if (estado.falharPool) throw new Error("falha sintética do pool");
      return 3;
    },
    get waitingCount() {
      if (estado.falharPool) throw new Error("falha sintética do pool");
      return 1;
    },
  },
  fila: {
    contarPorEstado: async () => {
      if (estado.falharFila) throw new Error("falha sintética da fila");
      return estado.grupos;
    },
    maisAntigaAberta: async () => {
      if (estado.falharFila) throw new Error("falha sintética da fila");
      return estado.maisAntiga;
    },
  },
  assinarConsulta: (ouvinte) => {
    estado.ouvintes.push(ouvinte);
  },
};

beforeAll(() => {
  registrarMetricasDoBanco(fonte);
});

beforeEach(() => {
  estado.grupos = [];
  estado.maisAntiga = null;
  estado.falharFila = false;
  estado.falharPool = false;
});

/** Valor de uma série exata do texto Prometheus. */
function valorDaSerie(texto: string, serie: string): number {
  for (const linha of texto.split("\n")) {
    if (linha.startsWith(`${serie} `)) {
      return Number(linha.slice(serie.length + 1));
    }
  }
  return Number.NaN;
}

async function textoDoRegistro(): Promise<string> {
  return metricas().registro.metrics();
}

describe("pool de conexões", () => {
  it("publica total, idle, in_use e waiting", async () => {
    const texto = await textoDoRegistro();

    expect(valorDaSerie(texto, 'frequenciapp_db_pool_connections{state="total"}')).toBe(7);
    expect(valorDaSerie(texto, 'frequenciapp_db_pool_connections{state="idle"}')).toBe(3);
    expect(valorDaSerie(texto, 'frequenciapp_db_pool_connections{state="in_use"}')).toBe(4);
    expect(valorDaSerie(texto, 'frequenciapp_db_pool_connections{state="waiting"}')).toBe(1);
  });
});

describe("fila de planilhas", () => {
  it("publica os cinco estados, inclusive zerados, e a idade do item mais antigo", async () => {
    estado.grupos = [
      { estado: "AGUARDANDO", quantidade: 2 },
      { estado: "EM_ANDAMENTO", quantidade: 1 },
      { estado: "FALHOU", quantidade: 1 },
      { estado: "CONCLUIDO", quantidade: 4 },
    ];
    estado.maisAntiga = AGORA;

    const texto = await textoDoRegistro();

    expect(valorDaSerie(texto, 'frequenciapp_fila_planilha_itens{estado="AGUARDANDO"}')).toBe(2);
    expect(valorDaSerie(texto, 'frequenciapp_fila_planilha_itens{estado="EM_ANDAMENTO"}')).toBe(1);
    expect(valorDaSerie(texto, 'frequenciapp_fila_planilha_itens{estado="FALHOU"}')).toBe(1);
    expect(valorDaSerie(texto, 'frequenciapp_fila_planilha_itens{estado="CONCLUIDO"}')).toBe(4);
    expect(valorDaSerie(texto, 'frequenciapp_fila_planilha_itens{estado="DESCARTADO"}')).toBe(0);
    expect(valorDaSerie(texto, "frequenciapp_fila_planilha_mais_antiga_timestamp_seconds")).toBe(
      AGORA.getTime() / 1000,
    );
  });

  it("publica zero no timestamp quando não há item aberto", async () => {
    estado.grupos = [];
    estado.maisAntiga = null;

    const texto = await textoDoRegistro();

    for (const estadoDaFila of [
      "AGUARDANDO",
      "EM_ANDAMENTO",
      "FALHOU",
      "CONCLUIDO",
      "DESCARTADO",
    ]) {
      expect(
        valorDaSerie(texto, `frequenciapp_fila_planilha_itens{estado="${estadoDaFila}"}`),
      ).toBe(0);
    }
    expect(valorDaSerie(texto, "frequenciapp_fila_planilha_mais_antiga_timestamp_seconds")).toBe(0);
  });
});

describe("consultas do banco", () => {
  it("observa a duração em segundos, sem SQL nem parâmetros em labels", async () => {
    const antesTexto = await textoDoRegistro();
    const antesContagem = valorDaSerie(antesTexto, "frequenciapp_db_query_duration_seconds_count");
    const antesSoma = valorDaSerie(antesTexto, "frequenciapp_db_query_duration_seconds_sum");

    for (const ouvinte of estado.ouvintes) {
      ouvinte(12.5);
    }

    const texto = await textoDoRegistro();

    expect(valorDaSerie(texto, "frequenciapp_db_query_duration_seconds_count")).toBe(
      antesContagem + 1,
    );
    expect(valorDaSerie(texto, "frequenciapp_db_query_duration_seconds_sum")).toBeCloseTo(
      antesSoma + 0.0125,
      6,
    );
    expect(
      valorDaSerie(texto, 'frequenciapp_db_query_duration_seconds_bucket{le="0.025"}'),
    ).toBeGreaterThanOrEqual(1);
    expect(texto).not.toContain('query="');
  });
});

describe("falhas de coleta", () => {
  it("incrementa o contador por coletor e mantém a resposta", async () => {
    const textoAntes = await textoDoRegistro();
    const errosFilaAntes = valorDaSerie(
      textoAntes,
      'frequenciapp_coleta_erros_total{coletor="fila"}',
    );
    const errosPoolAntes = valorDaSerie(
      textoAntes,
      'frequenciapp_coleta_erros_total{coletor="pool"}',
    );

    estado.falharFila = true;
    estado.falharPool = true;

    const texto = await textoDoRegistro();

    expect(texto).toContain("frequenciapp_coleta_erros_total");
    expect(valorDaSerie(texto, 'frequenciapp_coleta_erros_total{coletor="fila"}')).toBe(
      errosFilaAntes + 1,
    );
    expect(valorDaSerie(texto, 'frequenciapp_coleta_erros_total{coletor="pool"}')).toBe(
      errosPoolAntes + 1,
    );
    expect(
      valorDaSerie(texto, 'frequenciapp_coleta_duracao_seconds{coletor="fila"}'),
    ).toBeGreaterThanOrEqual(0);
    expect(
      valorDaSerie(texto, 'frequenciapp_coleta_duracao_seconds{coletor="pool"}'),
    ).toBeGreaterThanOrEqual(0);
  });

  it("registra os coletores apenas uma vez", async () => {
    expect(() => registrarMetricasDoBanco(fonte)).not.toThrow();

    const texto = await textoDoRegistro();
    expect(texto.match(/# HELP frequenciapp_db_pool_connections /g)).toHaveLength(1);
  });
});
