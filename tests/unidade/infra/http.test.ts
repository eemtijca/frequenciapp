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
import { erroApi, json, executarRota } from "@/infra/http";
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
    requisitar("/api/frequencias", "POST");

    const resposta = await executarRota(async () => {
      await new Promise((resolver) => setTimeout(resolver, 5));
      return json({ ok: true }, 201);
    });

    expect(resposta.status).toBe(201);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="POST",route="/api/frequencias",status="201"} 1',
    );
    expect(texto).toContain(
      'frequenciapp_http_request_duration_seconds_count{method="POST",route="/api/frequencias"} 1',
    );
    expect(somaDaDuracao(texto, "/api/frequencias")).toBeGreaterThan(0);
  });

  it("registra o status traduzido quando o manipulador lança", async () => {
    requisitar("/api/alunos/:id", "DELETE");

    const resposta = await executarRota(async () => {
      throw new ErroHttp("Registro em conflito.", 409);
    });

    expect(resposta.status).toBe(409);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="DELETE",route="/api/alunos/:id",status="409"} 1',
    );
    expect(await valorEmAndamento()).toBe(0);
  });

  it("registra 401 e 404 com o rótulo estático da rota", async () => {
    requisitar("/api/justificativas/:codigo", "GET");
    const semSessao = await executarRota(async () => erroApi("Sua sessão expirou.", 401));

    requisitar("/api/turmas/:id", "GET");
    const semRota = await executarRota(async () => erroApi("Recurso não encontrado.", 404));

    expect(semSessao.status).toBe(401);
    expect(semRota.status).toBe(404);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="GET",route="/api/justificativas/:codigo",status="401"} 1',
    );
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="GET",route="/api/turmas/:id",status="404"} 1',
    );
  });

  it("continua funcionando fora de um contexto de requisição", async () => {
    estado.falhar = true;

    const resposta = await executarRota(async () => json({ ok: true }));

    expect(resposta.status).toBe(200);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="OUTRO",route="desconhecida",status="200"} 1',
    );
  });

  it("transforma método inventado em OUTRO", async () => {
    requisitar("/api/saude", "NAVE");

    const resposta = await executarRota(async () => json({ ok: true }));

    expect(resposta.status).toBe(200);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="OUTRO",route="/api/saude",status="200"} 1',
    );
    expect(texto).not.toContain('method="NAVE"');
  });

  it("reduz um caminho livre no cabeçalho ao template da rota", async () => {
    requisitar("/api/alunos/ana-paula.souza_2", "GET");

    const resposta = await executarRota(async () => json({ ok: true }));

    expect(resposta.status).toBe(200);
    const texto = await metricas().registro.metrics();
    expect(texto).toContain(
      'frequenciapp_http_requests_total{method="GET",route="/api/alunos/:id",status="200"} 1',
    );
    expect(texto).not.toContain("ana-paula");
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
    requisitar("/api/alunos", "GET");
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
