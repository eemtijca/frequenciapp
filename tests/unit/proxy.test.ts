// Confere a política de scripts necessária ao seletor do Google Planilhas.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";

describe("CSP do seletor de planilhas", () => {
  it("permite carregar o script oficial do Google Picker", () => {
    const resposta = proxy(new NextRequest("http://localhost:3000/"));
    const csp = resposta.headers.get("Content-Security-Policy");

    expect(csp).toMatch(/script-src[^;]*https:\/\/apis\.google\.com/);
  });
});
