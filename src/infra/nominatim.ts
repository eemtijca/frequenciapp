// Busca de endereço no Nominatim, uma consulta por ação. Sem a URL, a tela segue com mapa e GPS.
import { z } from "zod";

const TEMPO_MS = 8_000;
const LIMITE = 5;

const esquemaBusca = z.array(
  z.object({
    display_name: z.string(),
    lat: z.string(),
    lon: z.string(),
  }),
);

export interface LugarEncontrado {
  rotulo: string;
  latitude: number;
  longitude: number;
}

/** Lê a lista do Nominatim e descarta item sem coordenada numérica. */
export function interpretarBuscaNominatim(corpo: unknown): LugarEncontrado[] {
  const lido = esquemaBusca.safeParse(corpo);
  if (!lido.success) return [];
  const lugares: LugarEncontrado[] = [];
  for (const item of lido.data) {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    const rotulo = item.display_name.trim().replace(/\s+/g, " ");
    if (!rotulo || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
    lugares.push({ rotulo, latitude, longitude });
    if (lugares.length === LIMITE) break;
  }
  return lugares;
}

/** Uma busca explícita. O serviço público pede identificação e não serve para sugestão a cada tecla. */
export async function buscarNoNominatim(
  base: string,
  consulta: string,
): Promise<LugarEncontrado[] | null> {
  const url = new URL(`${base.replace(/\/+$/, "")}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(LIMITE));
  url.searchParams.set("q", consulta);
  try {
    const resposta = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR",
        "User-Agent": "FrequenciApp (rota de prova escolar)",
      },
      signal: AbortSignal.timeout(TEMPO_MS),
    });
    if (!resposta.ok) return null;
    return interpretarBuscaNominatim(await resposta.json());
  } catch {
    return null;
  }
}
