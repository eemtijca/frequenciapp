// A organização visual é restrita à administração e exige origem válida.
import { beforeAll, describe, expect, it } from "vitest";
const base = process.env.APP_URL ?? "http://localhost:3000";
let cookieCoord = "";
beforeAll(async () => {
  const resposta = await fetch(`${base}/api/auth/entrar`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.TESTE_COORD_EMAIL ?? "demo@escola.exemplo",
      senha: process.env.TESTE_COORD_SENHA ?? "DemoFrequencia2026",
    }),
  });
  expect(resposta.status).toBe(200);
  cookieCoord = resposta.headers.get("set-cookie")?.split(";")[0] ?? "";
});
describe.each(["planilha", "planilha-saidas"])("permissão para limpar cópias de %s", (rota) => {
  it("exige sessão administrativa e recusa uma origem externa", async () => {
    for (const [cookie, origem, status] of [
      ["", base, 401],
      [cookieCoord, base, 403],
      [cookieCoord, "https://origem.exemplo", 403],
    ] as const) {
      const resposta = await fetch(`${base}/api/${rota}/limpar-copias`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: origem, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(resposta.status).toBe(status);
    }
  });
});
describe.each(["planilha", "planilha-saidas", "planilha-entradas"])(
  "permissão para organizar %s",
  (rota) => {
    it("exige sessão administrativa", async () => {
      for (const [cookie, status] of [
        ["", 401],
        [cookieCoord, 403],
      ] as const) {
        const resposta = await fetch(`${base}/api/${rota}/organizar`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
          body: JSON.stringify({ aba: "QA" }),
        });
        expect(resposta.status).toBe(status);
      }
    });
    it("recusa origem externa", async () => {
      const resposta = await fetch(`${base}/api/${rota}/organizar`, {
        method: "POST",
        headers: {
          Cookie: cookieCoord,
          Origin: "https://origem.exemplo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ aba: "QA" }),
      });
      expect(resposta.status).toBe(403);
    });
  },
);
