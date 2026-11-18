// Instrumentação central das rotas: status, duração, concorrência e fail-open.
import { afterEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  cabecalhos: new Map<string, string>(),
  falhar: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (estado.falhar) throw new Error("fora do contexto de requisição");
    return { get: (nome: string) => estado.cabecalhos.get(nome) ?? null };
  },
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: { authSecret: "segredo-sintetico-http" } }));
vi.mock("@/application/sessao", () => ({ identidadeAtual: vi.fn() }));

import { ErroHttp } from "@/infra/erros";
import { json, executarRota } from "@/infra/http";
import { metricas } from "@/infra/metricas";

function requisitar(rota: string, metodo: string): void {
  estado.cabecalhos.set("x-frequenciapp-rota", rota);
  estado.cabecalhos.set("x-frequenciapp-metodo", metodo);
}

async function valorEmAndamento(): Promise<number | undefined> {
  const { values } = await metricas().emAndamento.get();
  return values[0]?.value;
}

function somaDaDuracao(texto: string, rota: string): number {
  const encontrado = texto.match(
    new RegExp(
      `frequenciapp_http_request_duration_seconds_sum\\{method="[^"]+",route="${rota}"\\} ([0-9.e+-]+)`,
    ),
  );
  return Number(encontrado?.[1] ?? Number.NaN);
}

afterEach(() => {
  estado.cabecalhos.clear();
  estado.falhar = false;
  vi.doUnmock("@/infra/metricas");
  vi.resetModules();
});

describe("instrumentação de executarRota", () => {
  it("registra status e duração de uma resposta bem-sucedida", async () => {
    requisitar("/api/http-sucesso", "POST");

    const resposta = await executarRota(async () => {
      await new Promise((resolver) => setTimeout(resolver, 5));
      return json({ ok: true }, 201);
    });

    expect(resposta.status).toBe(201);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="POST",route="/api/http-sucesso",status="201"} 1',
    );
    expect(texto).toContain(
      'frequenciapp_http_request_duration_seconds_count{method="POST",route="/api/http-sucesso"} 1',
    );
    expect(somaDaDuracao(texto, "/api/http-sucesso")).toBeGreaterThan(0);
  });

  it("registra o status traduzido quando o manipulador lança", async () => {
    requisitar("/api/http-erro", "DELETE");

    const resposta = await executarRota(async () => {
      throw new ErroHttp("Registro em conflito.", 409);
    });

    expect(resposta.status).toBe(409);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="DELETE",route="/api/http-erro",status="409"} 1',
    );
    expect(await valorEmAndamento()).toBe(0);
  });

  it("continua funcionando fora de um contexto de requisição", async () => {
    estado.falhar = true;

    const resposta = await executarRota(async () => json({ ok: true }));

    expect(resposta.status).toBe(200);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="DESCONHECIDO",route="desconhecida",status="200"} 1',
    );
  });

  it("não derruba a rota quando a métrica falha", async () => {
    vi.resetModules();
    vi.doMock("@/infra/metricas", () => ({
      observarRequisicao: () => {
        throw new Error("falha sintética da métrica");
      },
      requisicaoIniciada: () => {
        throw new Error("falha sintética da métrica");
      },
      requisicaoFinalizada: () => {
        throw new Error("falha sintética da métrica");
      },
    }));
    const { executarRota: executarComFalha } = await import("@/infra/http");

    const resposta = await executarComFalha(async () => json({ ok: true }, 202));

    expect(resposta.status).toBe(202);
    await expect(resposta.json()).resolves.toEqual({ ok: true });
  });

  it("incrementa e zera o gauge de requisições em andamento", async () => {
    requisitar("/api/http-em-andamento", "GET");
    let durante = -1;

    const resposta = await executarRota(async () => {
      durante = (await valorEmAndamento()) ?? -1;
      return json({ ok: true });
    });

    expect(resposta.status).toBe(200);
    expect(durante).toBe(1);
    expect(await valorEmAndamento()).toBe(0);
  });

  it("não instrumenta a própria rota de métricas", async () => {
    requisitar("/api/metricas", "GET");

    await executarRota(async () => json({ ok: true }));

    const texto = await metricas().registro.metrics();
    expect(texto).not.toContain('route="/api/metricas"');
    expect(await valorEmAndamento()).toBe(0);
  });
});
