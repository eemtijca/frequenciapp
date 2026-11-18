// Contrato do endpoint interno de métricas contra o aplicativo no ar.
import { describe, expect, it } from "vitest";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = process.env.METRICAS_TOKEN ?? "";
const TEM_TOKEN = TOKEN.length > 0;

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
  });
});
