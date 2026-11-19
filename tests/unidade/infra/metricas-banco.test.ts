// Coletas de banco e fila: pool, consultas, amostra compartilhada, validade curta
// e falhas isoladas.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EstadoItemFila } from "@/domain/fila-planilha";
import { metricas } from "@/infra/metricas";
import {
  registrarMetricasDoBanco,
  type AmostraDaFila,
  type FonteDeMetricasDoBanco,
} from "@/infra/metricas-banco";

const AGORA = new Date("2026-01-02T03:04:05.000Z");
const VALIDADE_MS = 15_000;

interface Adiado<T> {
  promessa: Promise<T>;
  resolver(valor: T): void;
}

function adiar<T>(): Adiado<T> {
  let resolver: (valor: T) => void = () => undefined;
  const promessa = new Promise<T>((resolverPromessa) => {
    resolver = resolverPromessa;
  });
  return { promessa, resolver };
}

const estado = {
  contagens: new Map<EstadoItemFila, number>(),
  maisAntiga: null as Date | null,
  falharFila: false,
  falharPool: false,
  chamadasFila: 0,
  fila: null as Promise<AmostraDaFila> | null,
  agora: AGORA.getTime(),
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
    lerAmostra: async () => {
      estado.chamadasFila += 1;
      if (estado.fila) return estado.fila;
      if (estado.falharFila) throw new Error("falha sintética da fila");
      return { contagens: estado.contagens, maisAntiga: estado.maisAntiga };
    },
  },
  assinarConsulta: (ouvinte) => {
    estado.ouvintes.push(ouvinte);
  },
  agora: () => estado.agora,
};

beforeAll(() => {
  registrarMetricasDoBanco(fonte);
});

beforeEach(() => {
  // Cada teste começa com a amostra anterior vencida.
  estado.agora += VALIDADE_MS + 60_000;
  estado.contagens = new Map();
  estado.maisAntiga = null;
  estado.falharFila = false;
  estado.falharPool = false;
  estado.chamadasFila = 0;
  estado.fila = null;
});

/** Valor de uma série exata do texto Prometheus; zero quando a série ainda não existe. */
function valorDaSerie(texto: string, serie: string): number {
  for (const linha of texto.split("\n")) {
    if (linha.startsWith(`${serie} `)) {
      return Number(linha.slice(serie.length + 1));
    }
  }
  return 0;
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
    estado.contagens = new Map([
      ["AGUARDANDO", 2],
      ["EM_ANDAMENTO", 1],
      ["FALHOU", 1],
      ["CONCLUIDO", 4],
    ]);
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
    expect(valorDaSerie(texto, "frequenciapp_fila_planilha_atualizado_timestamp_seconds")).toBe(
      estado.agora / 1000,
    );
  });

  it("publica zero real quando a fila está vazia", async () => {
    estado.contagens = new Map();
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
    expect(valorDaSerie(texto, "frequenciapp_fila_planilha_atualizado_timestamp_seconds")).toBe(
      estado.agora / 1000,
    );
    expect(estado.chamadasFila).toBe(1);
  });

  it("reutiliza a amostra dentro da validade e consulta de novo depois dela", async () => {
    estado.contagens = new Map([["AGUARDANDO", 1]]);
    estado.maisAntiga = AGORA;
    const primeiro = await textoDoRegistro();
    const lidoEm = estado.agora;

    estado.contagens = new Map([["AGUARDANDO", 5]]);
    estado.agora = lidoEm + VALIDADE_MS - 1;
    const dentroDaValidade = await textoDoRegistro();

    expect(estado.chamadasFila).toBe(1);
    expect(
      valorDaSerie(dentroDaValidade, 'frequenciapp_fila_planilha_itens{estado="AGUARDANDO"}'),
    ).toBe(1);
    expect(
      valorDaSerie(dentroDaValidade, "frequenciapp_fila_planilha_atualizado_timestamp_seconds"),
    ).toBe(lidoEm / 1000);

    estado.agora = lidoEm + VALIDADE_MS;
    const depoisDaValidade = await textoDoRegistro();

    expect(estado.chamadasFila).toBe(2);
    expect(
      valorDaSerie(depoisDaValidade, 'frequenciapp_fila_planilha_itens{estado="AGUARDANDO"}'),
    ).toBe(5);
    expect(
      valorDaSerie(depoisDaValidade, "frequenciapp_fila_planilha_atualizado_timestamp_seconds"),
    ).toBe(estado.agora / 1000);
    // A amostra anterior foi realmente publicada antes da troca.
    expect(valorDaSerie(primeiro, 'frequenciapp_fila_planilha_itens{estado="AGUARDANDO"}')).toBe(1);
  });

  it("compartilha uma única consulta entre raspagens concorrentes", async () => {
    const pendente = adiar<AmostraDaFila>();
    estado.contagens = new Map([["FALHOU", 3]]);
    estado.maisAntiga = AGORA;
    estado.fila = pendente.promessa;

    const primeira = textoDoRegistro();
    const segunda = textoDoRegistro();
    await Promise.resolve();
    expect(estado.chamadasFila).toBe(1);

    pendente.resolver({ contagens: estado.contagens, maisAntiga: AGORA });
    const [textoA, textoB] = await Promise.all([primeira, segunda]);

    expect(estado.chamadasFila).toBe(1);
    for (const texto of [textoA, textoB]) {
      expect(valorDaSerie(texto, 'frequenciapp_fila_planilha_itens{estado="FALHOU"}')).toBe(3);
      expect(valorDaSerie(texto, "frequenciapp_fila_planilha_atualizado_timestamp_seconds")).toBe(
        estado.agora / 1000,
      );
    }

    // A raspagem seguinte ainda reutiliza a amostra recém-lida.
    await textoDoRegistro();
    expect(estado.chamadasFila).toBe(1);
  });

  it("mantém a última amostra válida na falha e recupera na leitura seguinte", async () => {
    estado.contagens = new Map([
      ["AGUARDANDO", 2],
      ["CONCLUIDO", 1],
    ]);
    estado.maisAntiga = AGORA;
    await textoDoRegistro();
    const lidoEm = estado.agora;
    const antes = await textoDoRegistro();
    const errosAntes = valorDaSerie(antes, 'frequenciapp_coleta_erros_total{coletor="fila"}');

    estado.agora = lidoEm + VALIDADE_MS + 1;
    estado.falharFila = true;
    const falha = await textoDoRegistro();

    expect(valorDaSerie(falha, 'frequenciapp_coleta_erros_total{coletor="fila"}')).toBe(
      errosAntes + 1,
    );
    expect(valorDaSerie(falha, 'frequenciapp_fila_planilha_itens{estado="AGUARDANDO"}')).toBe(2);
    expect(valorDaSerie(falha, 'frequenciapp_fila_planilha_itens{estado="CONCLUIDO"}')).toBe(1);
    expect(valorDaSerie(falha, "frequenciapp_fila_planilha_atualizado_timestamp_seconds")).toBe(
      lidoEm / 1000,
    );
    expect(estado.chamadasFila).toBe(2);

    estado.agora += 1;
    estado.falharFila = false;
    estado.contagens = new Map([["AGUARDANDO", 0]]);
    estado.maisAntiga = null;
    const recuperada = await textoDoRegistro();

    expect(estado.chamadasFila).toBe(3);
    expect(valorDaSerie(recuperada, 'frequenciapp_coleta_erros_total{coletor="fila"}')).toBe(
      errosAntes + 1,
    );
    expect(valorDaSerie(recuperada, 'frequenciapp_fila_planilha_itens{estado="AGUARDANDO"}')).toBe(
      0,
    );
    expect(
      valorDaSerie(recuperada, "frequenciapp_fila_planilha_mais_antiga_timestamp_seconds"),
    ).toBe(0);
    expect(
      valorDaSerie(recuperada, "frequenciapp_fila_planilha_atualizado_timestamp_seconds"),
    ).toBe(estado.agora / 1000);
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
    estado.agora += VALIDADE_MS + 1;

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
