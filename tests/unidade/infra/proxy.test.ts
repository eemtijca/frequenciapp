// Confere o CSP: script do seletor do Google Planilhas e imagens só do próprio servidor e dos tiles do mapa.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("CSP do seletor de planilhas", () => {
  it("permite carregar o script oficial do Google Picker", () => {
    const resposta = proxy(new NextRequest("http://localhost:3000/"));
    const csp = resposta.headers.get("Content-Security-Policy");

    expect(csp).toMatch(/script-src[^;]*https:\/\/apis\.google\.com/);
  });
});

describe("CSP do mapa de locais de prova", () => {
  const diretiva = (csp: string | null, nome: string) =>
    csp
      ?.split(";")
      .map((parte) => parte.trim())
      .find((parte) => parte.startsWith(`${nome} `));

  it("libera imagens do servidor de tiles do OpenStreetMap e de nenhum outro destino externo", () => {
    const csp = proxy(new NextRequest("http://localhost:3000/")).headers.get(
      "Content-Security-Policy",
    );
    expect(diretiva(csp, "img-src")).toBe(
      "img-src 'self' data: blob: https://tile.openstreetmap.org",
    );
  });

  it("não abre conexões de dados para o OpenStreetMap", () => {
    const csp = proxy(new NextRequest("http://localhost:3000/")).headers.get(
      "Content-Security-Policy",
    );
    expect(diretiva(csp, "connect-src")).not.toContain("openstreetmap");
    expect(csp).not.toMatch(/nominatim/i);
  });
});
