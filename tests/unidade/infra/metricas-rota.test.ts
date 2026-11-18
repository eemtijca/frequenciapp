// Normalização do caminho da API para um label de rota de baixa cardinalidade.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { rotaDeMetrica } from "@/infra/metricas-rota";
import { proxy } from "@/proxy";

describe("rotaDeMetrica", () => {
  it.each([
    ["/api/saude", "/api/saude"],
    ["/api/alunos", "/api/alunos"],
    ["/api/saude/", "/api/saude"],
    ["/api/alunos/3f1c2f0e-5a4b-4c6d-8e7f-9012345678ab", "/api/alunos/:id"],
    ["/api/turmas/3f1c2f0e-5a4b-4c6d-8e7f-9012345678ab/alunos", "/api/turmas/:id/alunos"],
    ["/api/calendario-letivo/2026-02-10", "/api/calendario-letivo/:dia"],
    ["/api/calendario-letivo/2026-02", "/api/calendario-letivo/:dia"],
    ["/api/justificativas/DOENCA", "/api/justificativas/:codigo"],
    ["/api/justificativas/DOENCA/observacoes", "/api/justificativas/:codigo/observacoes"],
    ["/api/liberadores/ATESTADO", "/api/liberadores/:codigo"],
    ["/api/ordem-almoco/3", "/api/ordem-almoco/:numero"],
    ["/api/ordem-almoco/0003", "/api/ordem-almoco/:numero"],
    ["/api/alunos/nome%20com%20espaco", "/api/alunos/:valor"],
    ["/api/alunos/ana-paula.souza_2", "/api/alunos/ana-paula.souza_2"],
    [`/api/alunos/${"a".repeat(65)}`, "/api/alunos/:valor"],
    ["/api/a/b/c/d/e/f/g", "/api/a/b/c/d/e/f/g"],
    ["/api/a/b/c/d/e/f/g/h", "/api/:rota-longa"],
    ["/", "fora-da-api"],
    ["/chamada", "fora-da-api"],
    ["/api", "fora-da-api"],
  ])("normaliza %s", (caminho, esperado) => {
    expect(rotaDeMetrica(caminho)).toBe(esperado);
  });
});

describe("cabeçalhos de rota do proxy", () => {
  it("define a rota e o método e sobrescreve os valores do cliente", () => {
    const resposta = proxy(
      new NextRequest("http://localhost:3000/api/alunos/3f1c2f0e-5a4b-4c6d-8e7f-9012345678ab", {
        headers: {
          "x-frequenciapp-rota": "/api/rota-inventada",
          "x-frequenciapp-metodo": "PATCH",
        },
      }),
    );

    expect(resposta.headers.get("x-middleware-request-x-frequenciapp-rota")).toBe(
      "/api/alunos/:id",
    );
    expect(resposta.headers.get("x-middleware-request-x-frequenciapp-metodo")).toBe("GET");
  });
});
