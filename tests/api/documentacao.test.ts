// Contratos da documentação interativa: página, especificação e Markdown.
import { describe, expect, it } from "vitest";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

describe("documentacao.test", () => {
  it("publica a interface, a especificação e a referência em Markdown", async () => {
    const interfaceDocs = await fetch(`${APP_URL}/api/docs`);
    expect(interfaceDocs.status).toBe(200);
    expect(interfaceDocs.headers.get("content-type")).toContain("text/html");

    const especificacao = await fetch(`${APP_URL}/api/docs/openapi.json`);
    expect(especificacao.status).toBe(200);
    const documento = (await especificacao.json()) as { openapi?: string };
    expect(documento.openapi).toBe("3.1.0");

    const referencia = await fetch(`${APP_URL}/api/docs/api.md`);
    expect(referencia.status).toBe(200);
    expect(referencia.headers.get("content-type")).toContain("text/markdown");
  });
});
