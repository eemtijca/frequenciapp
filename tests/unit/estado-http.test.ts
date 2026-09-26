// Mapa de status HTTP para a variante visual de estado.
import { describe, expect, it } from "vitest";
import { estadoDeErro } from "@/lib/estado-http";
import { ErroApi } from "@/lib/api-cliente";

function comStatus(status: number): ErroApi {
  return new ErroApi("falha", status);
}

describe("estado de erro por status HTTP", () => {
  it("mapeia sessão, permissão, ausência e conflito", () => {
    expect(estadoDeErro(comStatus(401))).toBe("sessao_expirada");
    expect(estadoDeErro(comStatus(403))).toBe("sem_permissao");
    expect(estadoDeErro(comStatus(404))).toBe("nao_encontrado");
    expect(estadoDeErro(comStatus(409))).toBe("conflito");
  });

  it("mapeia limite e dados inválidos", () => {
    expect(estadoDeErro(comStatus(400))).toBe("dados_invalidos");
    expect(estadoDeErro(comStatus(413))).toBe("limite");
    expect(estadoDeErro(comStatus(429))).toBe("limite");
  });

  it("mapeia falha de servidor como indisponível", () => {
    expect(estadoDeErro(comStatus(500))).toBe("indisponivel");
    expect(estadoDeErro(comStatus(503))).toBe("indisponivel");
  });

  it("trata falha de rede e valor inesperado como offline", () => {
    expect(estadoDeErro(new TypeError("Failed to fetch"))).toBe("offline");
    expect(estadoDeErro(null)).toBe("offline");
  });
});
