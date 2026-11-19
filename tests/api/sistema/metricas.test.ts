// Contrato do endpoint interno de métricas contra o aplicativo no ar, incluindo
// a amostra compartilhada da fila e o prazo da coleta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = process.env.METRICAS_TOKEN ?? "";
const TEM_TOKEN = TOKEN.length > 0;
const TEM_BANCO = Boolean(process.env.DATABASE_URL);
const VALIDADE_DA_AMOSTRA_S = 15;
const ESTADOS = ["AGUARDANDO", "EM_ANDAMENTO", "FALHOU", "CONCLUIDO", "DESCARTADO"] as const;

let banco: pg.Client | null = null;
let itemId = "";

function valorDaSerie(texto: string, serie: string): number {
  for (const linha of texto.split("\n")) {
    if (linha.startsWith(`${serie} `)) return Number(linha.slice(serie.length + 1));
  }
  return 0;
}

async function baixarMetricas(): Promise<string> {
  const resposta = await fetch(`${APP_URL}/api/metricas`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  expect(resposta.status).toBe(200);
  return resposta.text();
}

function contagem(texto: string, estado: (typeof ESTADOS)[number]): number {
  return valorDaSerie(texto, `frequenciapp_fila_planilha_itens{estado="${estado}"}`);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Garante que a próxima raspagem precise consultar o banco, sem sobrepor leituras. */
async function vencerAmostra(texto: string): Promise<number> {
  const atualizado = valorDaSerie(texto, "frequenciapp_fila_planilha_atualizado_timestamp_seconds");
  if (!Number.isFinite(atualizado) || atualizado <= 0) return 0;
  const idade = Date.now() / 1000 - atualizado;
  if (idade < VALIDADE_DA_AMOSTRA_S) {
    await esperar(Math.ceil((VALIDADE_DA_AMOSTRA_S - idade + 0.5) * 1000));
  }
  return atualizado;
}

beforeAll(async () => {
  const conexao = process.env.DATABASE_URL;
  if (!conexao?.startsWith("postgresql://")) return;
  banco = new pg.Client({ connectionString: conexao });
  await banco.connect();
});

afterAll(async () => {
  if (!banco) return;
  if (itemId) await banco.query("delete from fila_planilha where id = $1", [itemId]);
  await banco.end();
});

describe.skipIf(!TEM_TOKEN)("GET /api/metricas", () => {
  it("recusa um token errado", async () => {
    const resposta = await fetch(`${APP_URL}/api/metricas`, {
      headers: { Authorization: `Bearer ${"token-incorreto-para-o-contrato-000000"}` },
    });

    expect(resposta.status).toBe(401);
  });

  it("entrega o registro com token válido, sem cache e sem dados de aluno", async () => {
    const resposta = await fetch(`${APP_URL}/api/metricas`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain("text/plain");
    expect(resposta.headers.get("cache-control")).toBe("no-store");

    const texto = await resposta.text();
    expect(texto).toContain("frequenciapp_build_info");
    expect(texto).toContain("frequenciapp_db_pool_connections");
    expect(texto).toContain("frequenciapp_fila_planilha_itens");
    expect(texto).toContain("frequenciapp_fila_planilha_atualizado_timestamp_seconds");
  });

  it.skipIf(!TEM_BANCO)(
    "mantém a última amostra no timeout, não sobrepõe leituras e recupera depois",
    async () => {
      const cliente = banco;
      if (!cliente) throw new Error("Banco sintético indisponível.");
      await cliente.query("delete from fila_planilha");
      const criado = await cliente.query<{ id: string }>(
        `insert into fila_planilha (tipo, dia, estado, criado_em, atualizado_em)
         values ('FREQUENCIA', '2026-01-02', 'FALHOU', now() - interval '2 hours', now())
         returning id`,
      );
      itemId = criado.rows[0]?.id ?? "";
      expect(itemId).not.toBe("");

      // A primeira leitura é a amostra válida que o timeout deve preservar.
      const inicial = await baixarMetricas();
      const atualizadoInicial = valorDaSerie(
        inicial,
        "frequenciapp_fila_planilha_atualizado_timestamp_seconds",
      );
      expect(atualizadoInicial).toBeGreaterThan(0);
      const contagensIniciais = ESTADOS.map((estado) => contagem(inicial, estado));

      // A amostra vence e a próxima raspagem precisa consultar o banco.
      await vencerAmostra(inicial);

      await cliente.query("BEGIN");
      try {
        await cliente.query("LOCK TABLE fila_planilha IN ACCESS EXCLUSIVE MODE");
        const inicio = Date.now();
        const primeira = fetch(`${APP_URL}/api/metricas`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        await esperar(300);
        const segunda = fetch(`${APP_URL}/api/metricas`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        const [respostaA, respostaB] = await Promise.all([primeira, segunda]);
        const duracao = Date.now() - inicio;

        expect(respostaA.status).toBe(200);
        expect(respostaB.status).toBe(200);
        // O statement_timeout encerra a consulta e mantém o endpoint abaixo do scrape de 10s.
        expect(duracao).toBeLessThan(10_000);

        const [textoA, textoB] = await Promise.all([respostaA.text(), respostaB.text()]);
        const erros = valorDaSerie(textoA, 'frequenciapp_coleta_erros_total{coletor="fila"}');
        // As duas raspagens compartilham a mesma leitura e somam uma única falha.
        expect(
          erros - valorDaSerie(inicial, 'frequenciapp_coleta_erros_total{coletor="fila"}'),
        ).toBe(1);
        for (const texto of [textoA, textoB]) {
          expect(
            valorDaSerie(texto, "frequenciapp_fila_planilha_atualizado_timestamp_seconds"),
          ).toBe(atualizadoInicial);
          expect(ESTADOS.map((estado) => contagem(texto, estado))).toEqual(contagensIniciais);
        }
      } finally {
        await cliente.query("ROLLBACK");
      }

      // Sem amostra nova, a raspagem seguinte ainda consulta e recupera.
      const recuperada = await baixarMetricas();
      expect(
        valorDaSerie(recuperada, "frequenciapp_fila_planilha_atualizado_timestamp_seconds"),
      ).toBeGreaterThan(atualizadoInicial);
      expect(
        valorDaSerie(recuperada, 'frequenciapp_coleta_erros_total{coletor="fila"}') -
          valorDaSerie(inicial, 'frequenciapp_coleta_erros_total{coletor="fila"}'),
      ).toBe(1);
      expect(contagem(recuperada, "FALHOU")).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );
});
