// Registro Prometheus: identificação da versão, métricas padrão e observação HTTP.
import { describe, expect, it, vi } from "vitest";
import { COMMIT, VERSAO } from "@/infra/versao";
import {
  contentType,
  inicializarMetricas,
  metricas,
  observarRequisicao,
  registro,
} from "@/infra/metricas";

describe("registro de métricas", () => {
  it("publica a versão e a revisão em execução", async () => {
    const texto = await registro.metrics();

    expect(texto).toContain(`frequenciapp_build_info{version="${VERSAO}",revision="${COMMIT}"} 1`);
  });

  it("usa o formato de texto aceito pelo Prometheus 3", () => {
    expect(registro.contentType).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(contentType).toBe(registro.contentType);
  });

  it("inclui as métricas padrão do Node sem prefixo", async () => {
    const texto = await registro.metrics();

    expect(texto).toContain("process_cpu_user_seconds_total");
    expect(texto).not.toMatch(/frequenciapp_process_/);
  });
});

describe("observação de requisições", () => {
  it("conta status e duração por método e rota", async () => {
    observarRequisicao({ method: "GET", route: "/api/observacao-feliz" }, 201, 0.12);
    observarRequisicao({ method: "GET", route: "/api/observacao-feliz" }, 201, 0.2);

    const texto = await registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="GET",route="/api/observacao-feliz",status="201"} 2',
    );
    expect(texto).toContain(
      'frequenciapp_http_request_duration_seconds_count{method="GET",route="/api/observacao-feliz"} 2',
    );
    expect(texto).toMatch(
      /frequenciapp_http_request_duration_seconds_sum\{method="GET",route="\/api\/observacao-feliz"\} 0\.32/,
    );
    expect(texto).toContain(
      'frequenciapp_http_request_duration_seconds_bucket{le="0.25",method="GET",route="/api/observacao-feliz"} 2',
    );
  });

  it("não lança exceção quando a observação falha", () => {
    const contexto = {
      get method(): string {
        throw new Error("falha sintética");
      },
      route: "/api/observacao-com-falha",
    };

    expect(() => observarRequisicao(contexto, 200, 0.1)).not.toThrow();
  });

  it("reaproveita o mesmo registro no processo", async () => {
    const primeiro = metricas();
    vi.resetModules();
    const recarregado = await import("@/infra/metricas");

    expect(recarregado.metricas().registro).toBe(primeiro.registro);
    expect(recarregado.metricas()).toBe(primeiro);
  });

  it("prepara os coletores mesmo com chamadas repetidas", () => {
    expect(() => {
      inicializarMetricas();
      inicializarMetricas();
    }).not.toThrow();
  });
});
