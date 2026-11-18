// Normaliza o caminho da API para um label de rota de baixa cardinalidade.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}(-\d{2})?$/;
const NUMERO = /^\d+$/;
const SEGMENTO_SEGURO = /^[A-Za-z0-9._~-]+$/;
const SEGMENTOS_MAXIMOS = 8;

export function rotaDeMetrica(caminho: string): string {
  if (!caminho.startsWith("/api/")) return "fora-da-api";

  const partes = caminho.split("/").filter(Boolean);
  if (partes.length > SEGMENTOS_MAXIMOS) return "/api/:rota-longa";

  const normalizadas = partes.map((parte, indice) => {
    if (indice === 0) return "api";
    const anterior = partes[indice - 1];
    if (UUID.test(parte)) return ":id";
    if (DATA.test(parte)) return ":dia";
    if (NUMERO.test(parte)) return ":numero";
    if (anterior === "justificativas" || anterior === "liberadores") return ":codigo";
    if (parte.length > 64 || !SEGMENTO_SEGURO.test(parte)) return ":valor";
    return parte;
  });

  return `/${normalizadas.join("/")}`;
}
