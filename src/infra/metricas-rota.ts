// Normaliza o caminho e o método da requisição para labels estáveis de métricas.
import { ROTAS_DE_METRICA } from "@/infra/metricas-rotas";

const ROTA_DESCONHECIDA = "desconhecida";
const ROTA_FORA_DA_API = "fora-da-api";
const METODO_FORA_DO_CATALOGO = "OUTRO";

const METODOS_DE_METRICA: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Devolve o template estático da rota, nunca um segmento enviado pelo cliente.
 * Caminho de API fora do registro vira `desconhecida`; fora de `/api/` vira `fora-da-api`.
 */
export function rotaDeMetrica(caminho: string): string {
  if (!caminho.startsWith("/api/")) return ROTA_FORA_DA_API;
  const semBarraFinal = caminho.replace(/\/+$/, "");
  const encontrada = ROTAS_DE_METRICA.find((rota) => rota.padrao.test(semBarraFinal));
  return encontrada?.rotulo ?? ROTA_DESCONHECIDA;
}

/** Restringe o método ao conjunto do catálogo; qualquer outro valor vira `OUTRO`. */
export function metodoDeMetrica(metodo: string | null | undefined): string {
  if (!metodo) return METODO_FORA_DO_CATALOGO;
  const normalizado = metodo.trim().toUpperCase();
  return METODOS_DE_METRICA.has(normalizado) ? normalizado : METODO_FORA_DO_CATALOGO;
}
