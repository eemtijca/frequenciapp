// Normalização estática de rota e método para os labels das métricas HTTP.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { metodoDeMetrica, rotaDeMetrica } from "@/infra/metricas-rota";
import { proxy } from "@/proxy";

const UUID = "3f1c2f0e-5a4b-4c6d-8e7f-9012345678ab";

describe("rotaDeMetrica", () => {
  it.each([
    ["/api/saude", "/api/saude"],
    ["/api/saude/", "/api/saude"],
    ["/api/alunos", "/api/alunos"],
    ["/api/alunos/importacao", "/api/alunos/importacao"],
    [`/api/alunos/${UUID}`, "/api/alunos/:id"],
    [`/api/alunos/${UUID}/`, "/api/alunos/:id"],
    ["/api/alunos/ana-paula.souza_2", "/api/alunos/:id"],
    ["/api/alunos/fulano", "/api/alunos/:id"],
    ["/api/alunos/nome%20com%20espaco", "/api/alunos/:id"],
    [`/api/alunos/${"a".repeat(65)}`, "/api/alunos/:id"],
    ["/api/turmas/2026-02-10", "/api/turmas/:id"],
    ["/api/calendario-letivo/2026-02-10", "/api/calendario-letivo/:dia"],
    ["/api/calendario-letivo/2026-02", "/api/calendario-letivo/:dia"],
    ["/api/calendario-letivo/sincronizacao", "/api/calendario-letivo/sincronizacao"],
    ["/api/justificativas/DOENCA", "/api/justificativas/:codigo"],
    ["/api/liberadores/ATESTADO", "/api/liberadores/:codigo"],
    ["/api/ordem-almoco/3", "/api/ordem-almoco/:dia"],
    ["/api/ordem-almoco/0003", "/api/ordem-almoco/:dia"],
    [`/api/planilha/fila/${UUID}/descartar`, "/api/planilha/fila/:id/descartar"],
    ["/api/docs/api.md", "/api/docs/api.md"],
    ["/api/metricas", "/api/metricas"],
    ["/api/alunos/fulano/extra", "desconhecida"],
    ["/api/qualquer-coisa", "desconhecida"],
    ["/api/a/b/c/d/e/f/g", "desconhecida"],
    ["/api/a/b/c/d/e/f/g/h", "desconhecida"],
    ["/api", "fora-da-api"],
    ["/", "fora-da-api"],
    ["/chamada", "fora-da-api"],
  ])("mapeia %s para %s", (caminho, esperado) => {
    expect(rotaDeMetrica(caminho)).toBe(esperado);
  });

  it("não preserva nenhum valor enviado pelo cliente no rótulo", () => {
    const valores = [UUID, "2026-02-10", "ana-paula.souza_2", "fulano", "42", "escola@exemplo.br"];

    for (const valor of valores) {
      const rotulo = rotaDeMetrica(`/api/alunos/${valor}`);
      expect(rotulo).toBe("/api/alunos/:id");
      for (const proibido of valores) expect(rotulo).not.toContain(proibido);
    }
  });
});

describe("metodoDeMetrica", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
    "mantém o método conhecido %s",
    (metodo) => {
      expect(metodoDeMetrica(metodo)).toBe(metodo);
    },
  );

  it.each([["inventado"], ["NAVE"], ["TRACE"], [""], [null], [undefined]])(
    "transforma %s em OUTRO",
    (metodo) => {
      expect(metodoDeMetrica(metodo)).toBe("OUTRO");
    },
  );
});

describe("cabeçalhos de rota do proxy", () => {
  it("define a rota e o método e sobrescreve os valores do cliente", () => {
    const resposta = proxy(
      new NextRequest(`http://localhost:3000/api/alunos/${UUID}`, {
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

  it("substitui um método fora do catálogo por OUTRO", () => {
    const requisicao = new NextRequest("http://localhost:3000/api/saude");
    Object.defineProperty(requisicao, "method", { value: "NAVE" });

    const resposta = proxy(requisicao);

    expect(resposta.headers.get("x-middleware-request-x-frequenciapp-metodo")).toBe("OUTRO");
  });
});
