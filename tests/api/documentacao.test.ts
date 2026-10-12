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

  it.each([
    ["swagger-ui-bundle.js", "javascript"],
    ["swagger-ui.css", "text/css"],
  ])("serve %s como arquivo, sem retornar uma página de erro", async (arquivo, tipo) => {
    const resposta = await fetch(`${APP_URL}/vendor/swagger-ui/${arquivo}`);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain(tipo);
    expect((await resposta.text()).length).toBeGreaterThan(1000);
  });

  it("aponta o índice para agentes na raiz anônima", async () => {
    const raiz = await fetch(`${APP_URL}/`);
    expect(raiz.status).toBe(200);
    expect(raiz.headers.get("link")).toContain("</llms.txt>");

    const html = await raiz.text();
    expect(html).toContain('rel="alternate"');
    expect(html).toContain("llms.txt");

    const indice = await fetch(`${APP_URL}/llms.txt`);
    expect(indice.status).toBe(200);
    expect(await indice.text()).toContain("# FrequenciApp");
  });
});
