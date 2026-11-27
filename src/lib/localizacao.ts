// Leitura única da posição do aparelho pelo navegador, com mensagens em português para cada falha.

export interface PosicaoDoAparelho {
  latitude: number;
  longitude: number;
  /** Raio de incerteza informado pelo aparelho, em metros. */
  precisaoMetros: number;
}

export type MotivoSemPosicao =
  "sem-suporte" | "conexao-insegura" | "negada" | "indisponivel" | "demorou";

export class ErroDeLocalizacao extends Error {
  readonly motivo: MotivoSemPosicao;

  constructor(motivo: MotivoSemPosicao) {
    super(mensagemSemPosicao(motivo));
    this.name = "ErroDeLocalizacao";
    this.motivo = motivo;
  }
}

/** Frase curta para o aviso na tela; não repete o código técnico do navegador. */
export function mensagemSemPosicao(motivo: MotivoSemPosicao): string {
  switch (motivo) {
    case "sem-suporte":
      return "Este navegador não oferece localização.";
    case "conexao-insegura":
      return "A localização só funciona em conexão segura (HTTPS).";
    case "negada":
      return "O acesso à localização foi negado. Libere a localização deste site nas configurações do navegador.";
    case "indisponivel":
      return "Não foi possível obter a posição do aparelho. Confira se o GPS está ligado.";
    case "demorou":
      return "A leitura da posição demorou demais. Tente de novo em um lugar com melhor sinal.";
  }
}

function motivoDoCodigo(codigo: number): MotivoSemPosicao {
  // 1 = PERMISSION_DENIED, 3 = TIMEOUT; qualquer outro código é posição indisponível.
  if (codigo === 1) return "negada";
  if (codigo === 3) return "demorou";
  return "indisponivel";
}

/**
 * Lê a posição atual uma única vez, com GPS de alta precisão e sem reaproveitar leitura antiga.
 * Rejeita com ErroDeLocalizacao; nunca grava nem rastreia a posição.
 */
export function lerPosicaoDoAparelho(): Promise<PosicaoDoAparelho> {
  return new Promise((resolver, rejeitar) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      rejeitar(new ErroDeLocalizacao("sem-suporte"));
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      rejeitar(new ErroDeLocalizacao("conexao-insegura"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) =>
        resolver({
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          precisaoMetros: posicao.coords.accuracy,
        }),
      (erro) => rejeitar(new ErroDeLocalizacao(motivoDoCodigo(erro.code))),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/** Acima deste raio, em metros, a leitura é fraca para marcar um prédio. */
export const PRECISAO_FRACA_METROS = 100;
