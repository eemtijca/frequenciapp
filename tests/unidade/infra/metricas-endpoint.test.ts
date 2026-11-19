// Endpoint interno de métricas: token e resposta do registro.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "token-sintetico-de-metricas-para-teste-01";

const estado = vi.hoisted(() => ({
  token: undefined as string | undefined,
  chamadasAoBanco: 0,
  falharBanco: false,
  falharMetricas: false,
}));

vi.mock("@/infra/ambiente", () => ({
  ambiente: {
    get metricasToken() {
      return estado.token;
    },
  },
}));

vi.mock("@/infra/banco", () => ({
  banco: () => {
    estado.chamadasAoBanco += 1;
    if (estado.falharBanco) throw new Error("falha sintética do banco");
    return {};
  },
}));

vi.mock("@/infra/metricas", () => ({
  metricas: () => ({
    registro: {
      contentType: "text/plain; version=0.0.4; charset=utf-8",
      metrics: async () => {
        if (estado.falharMetricas) throw new Error("falha sintética da coleta");
        return "frequenciapp_build_info 1\n";
      },
    },
  }),
}));

vi.mock("@/infra/http", () => ({
  erroApi: (mensagem: string, status: number) =>
    Response.json({ error: mensagem }, { status, headers: { "Cache-Control": "no-store" } }),
}));

import { GET } from "@/app/api/metricas/route";

function pedir(cabecalhos: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/metricas", { headers: cabecalhos });
}

beforeEach(() => {
  estado.token = TOKEN;
  estado.chamadasAoBanco = 0;
  estado.falharBanco = false;
  estado.falharMetricas = false;
});

describe("GET /api/metricas", () => {
  it("responde 404 quando não há token configurado", async () => {
    estado.token = undefined;

    const resposta = await GET(pedir({ Authorization: `Bearer ${TOKEN}` }));

    expect(resposta.status).toBe(404);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    await expect(resposta.json()).resolves.toEqual({ error: "Recurso não encontrado." });
    expect(estado.chamadasAoBanco).toBe(0);
  });

  it("responde 401 sem token ou com token errado", async () => {
    const semToken = await GET(pedir());
    const tokenErrado = await GET(pedir({ Authorization: `Bearer ${"x".repeat(32)}` }));
    const tamanhoDiferente = await GET(pedir({ Authorization: "Bearer curto" }));

    expect(semToken.status).toBe(401);
    expect(tokenErrado.status).toBe(401);
    expect(tamanhoDiferente.status).toBe(401);
    await expect(semToken.json()).resolves.toEqual({ error: "Acesso não permitido." });
    await expect(tokenErrado.json()).resolves.toEqual({ error: "Acesso não permitido." });
    expect(estado.chamadasAoBanco).toBe(0);
  });

  it("entrega o registro com o tipo correto e sem cache", async () => {
    const resposta = await GET(pedir({ Authorization: `Bearer ${TOKEN}` }));

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    await expect(resposta.text()).resolves.toContain("frequenciapp_build_info");
    expect(estado.chamadasAoBanco).toBe(1);
  });

  it("entrega o registro com token válido mesmo com cabeçalhos de encaminhamento", async () => {
    for (const cabecalho of ["x-forwarded-for", "x-forwarded-proto"]) {
      const resposta = await GET(
        pedir({ Authorization: `Bearer ${TOKEN}`, [cabecalho]: "valor-sintetico" }),
      );

      expect(resposta.status, cabecalho).toBe(200);
      await expect(resposta.text()).resolves.toContain("frequenciapp_build_info");
    }
    expect(estado.chamadasAoBanco).toBe(2);
  });

  it("responde 503 quando a coleta falha", async () => {
    estado.falharMetricas = true;
    const semColeta = await GET(pedir({ Authorization: `Bearer ${TOKEN}` }));

    estado.falharMetricas = false;
    estado.falharBanco = true;
    const semBanco = await GET(pedir({ Authorization: `Bearer ${TOKEN}` }));

    expect(semColeta.status).toBe(503);
    expect(semBanco.status).toBe(503);
    await expect(semColeta.json()).resolves.toEqual({
      error: "As métricas não puderam ser coletadas.",
    });
    await expect(semBanco.json()).resolves.toEqual({
      error: "As métricas não puderam ser coletadas.",
    });
  });
});
