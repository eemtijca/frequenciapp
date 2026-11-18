// Registro Prometheus: identificação da versão, métricas padrão e observação HTTP.
import { describe, expect, it, vi } from "vitest";
import { COMMIT, VERSAO } from "@/infra/versao";
import {
  contentType,
  inicializarMetricas,
  metricas,
  observarRequisicao,
  registrarFilaProcessada,
  registrarFrequencia,
  registrarNotificacoes,
  registro,
} from "@/infra/metricas";

interface ContadoresDeDominio {
  salvo: number;
  conflito: number;
  concluido: number;
  falha: number;
  enviada: number;
  expirada: number;
  falhaDeAviso: number;
  ignorada: number;
}

function valorDoContador(texto: string, metrica: string, resultado: string): number {
  const prefixo = `${metrica}{resultado="${resultado}"}`;
  const linha = texto.split("\n").find((item) => item.startsWith(prefixo));
  return Number(linha?.split(" ").at(-1) ?? 0);
}

async function contadoresDeDominio(): Promise<ContadoresDeDominio> {
  const texto = await registro.metrics();
  return {
    salvo: valorDoContador(texto, "frequenciapp_frequencias_salvas_total", "salvo"),
    conflito: valorDoContador(texto, "frequenciapp_frequencias_salvas_total", "conflito"),
    concluido: valorDoContador(texto, "frequenciapp_fila_planilha_processados_total", "concluido"),
    falha: valorDoContador(texto, "frequenciapp_fila_planilha_processados_total", "falha"),
    enviada: valorDoContador(texto, "frequenciapp_notificacoes_enviadas_total", "enviada"),
    expirada: valorDoContador(texto, "frequenciapp_notificacoes_enviadas_total", "expirada"),
    falhaDeAviso: valorDoContador(texto, "frequenciapp_notificacoes_enviadas_total", "falha"),
    ignorada: valorDoContador(texto, "frequenciapp_notificacoes_enviadas_total", "ignorada"),
  };
}

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

describe("métricas de domínio", () => {
  it("declara os contadores de frequência, fila e notificações", async () => {
    registrarFrequencia("salvo");
    registrarFrequencia("conflito");
    registrarFilaProcessada({ concluidos: 1, falhas: 1 });
    registrarNotificacoes({ enviadas: 1, expiradas: 1, falhas: 1, ignoradas: 1 });

    const texto = await registro.metrics();
    expect(texto).toContain("# TYPE frequenciapp_frequencias_salvas_total counter");
    expect(texto).toContain("# TYPE frequenciapp_fila_planilha_processados_total counter");
    expect(texto).toContain("# TYPE frequenciapp_notificacoes_enviadas_total counter");
    expect(metricas().frequenciasSalvas).toBeDefined();
    expect(metricas().filaPlanilhaProcessados).toBeDefined();
    expect(metricas().notificacoesEnviadas).toBeDefined();
  });

  it("soma os desfechos aos contadores com os rótulos permitidos", async () => {
    const antes = await contadoresDeDominio();

    registrarFrequencia("salvo");
    registrarFrequencia("conflito");
    registrarFilaProcessada({ concluidos: 2, falhas: 1 });
    registrarNotificacoes({ enviadas: 3, expiradas: 2, falhas: 1, ignoradas: 4 });

    const depois = await contadoresDeDominio();
    expect(depois.salvo - antes.salvo).toBe(1);
    expect(depois.conflito - antes.conflito).toBe(1);
    expect(depois.concluido - antes.concluido).toBe(2);
    expect(depois.falha - antes.falha).toBe(1);
    expect(depois.enviada - antes.enviada).toBe(3);
    expect(depois.expirada - antes.expirada).toBe(2);
    expect(depois.falhaDeAviso - antes.falhaDeAviso).toBe(1);
    expect(depois.ignorada - antes.ignorada).toBe(4);

    const texto = await registro.metrics();
    expect(texto).toContain('frequenciapp_frequencias_salvas_total{resultado="salvo"}');
    expect(texto).toContain('frequenciapp_fila_planilha_processados_total{resultado="concluido"}');
    expect(texto).toContain('frequenciapp_notificacoes_enviadas_total{resultado="ignorada"}');
    expect(texto).not.toMatch(
      /frequenciapp_(frequencias_salvas|fila_planilha_processados|notificacoes_enviadas)_total\{[^}]*[0-9a-f]{8}-[0-9a-f]{4}/,
    );
  });

  it("ignora resumos zerados e não lança exceção quando a métrica falha", async () => {
    const antes = await contadoresDeDominio();
    registrarFilaProcessada({ concluidos: 0, falhas: 0 });
    registrarNotificacoes({ enviadas: 0, expiradas: 0, falhas: 0, ignoradas: 0 });
    expect(await contadoresDeDominio()).toEqual(antes);

    const espiao = vi.spyOn(metricas().frequenciasSalvas, "inc").mockImplementation(() => {
      throw new Error("falha sintética");
    });
    expect(() => registrarFrequencia("salvo")).not.toThrow();
    espiao.mockRestore();

    const resumo = {
      get concluidos(): number {
        throw new Error("falha sintética");
      },
      falhas: 0,
    };
    expect(() => registrarFilaProcessada(resumo)).not.toThrow();

    const totais = {
      get enviadas(): number {
        throw new Error("falha sintética");
      },
      expiradas: 0,
      falhas: 0,
      ignoradas: 0,
    };
    expect(() => registrarNotificacoes(totais)).not.toThrow();
  });
});
