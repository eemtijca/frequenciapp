// Leitura única do GPS: sucesso e tradução de cada falha do navegador para o aviso da tela.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErroDeLocalizacao,
  lerPosicaoDoAparelho,
  mensagemSemPosicao,
  PRECISAO_FRACA_METROS,
} from "@/lib/localizacao";

function comGeolocalizacao(
  getCurrentPosition: (
    sucesso: (posicao: {
      coords: { latitude: number; longitude: number; accuracy: number };
    }) => void,
    erro: (falha: { code: number }) => void,
  ) => void,
  segura = true,
): void {
  vi.stubGlobal("window", { isSecureContext: segura });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("leitura da posição do aparelho", () => {
  it("devolve latitude, longitude e precisão da leitura atual", async () => {
    comGeolocalizacao((sucesso) =>
      sucesso({ coords: { latitude: -3.7319, longitude: -38.5267, accuracy: 18 } }),
    );
    await expect(lerPosicaoDoAparelho()).resolves.toEqual({
      latitude: -3.7319,
      longitude: -38.5267,
      precisaoMetros: 18,
    });
    expect(PRECISAO_FRACA_METROS).toBe(100);
  });

  it.each([
    [1, "negada"],
    [2, "indisponivel"],
    [3, "demorou"],
  ] as const)("traduz o código %i para %s", async (codigo, motivo) => {
    comGeolocalizacao((_sucesso, erro) => erro({ code: codigo }));
    await expect(lerPosicaoDoAparelho()).rejects.toMatchObject({
      name: "ErroDeLocalizacao",
      motivo,
      message: mensagemSemPosicao(motivo),
    });
  });

  it("recusa sem suporte a geolocalização", async () => {
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", {});
    await expect(lerPosicaoDoAparelho()).rejects.toBeInstanceOf(ErroDeLocalizacao);
    await expect(lerPosicaoDoAparelho()).rejects.toMatchObject({ motivo: "sem-suporte" });
  });

  it("recusa fora de contexto seguro sem chamar o navegador", async () => {
    const leitura = vi.fn();
    comGeolocalizacao(leitura, false);
    await expect(lerPosicaoDoAparelho()).rejects.toMatchObject({ motivo: "conexao-insegura" });
    expect(leitura).not.toHaveBeenCalled();
  });
});
