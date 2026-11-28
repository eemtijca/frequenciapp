// Cliente do OSRM: matriz e traçado por ruas. Sem a URL, ou se a consulta falhar, quem chama usa linha reta.
import { z } from "zod";
import type { PontoGeografico } from "@/domain/provas-especificas";
import type { TipoDeTrecho, TrechoDesenhado } from "@/domain/rota-da-prova";

const TEMPO_MS = 8_000;

const numeroOuNulo = z.number().finite().nonnegative().nullable();

const esquemaTabela = z.object({
  code: z.string(),
  durations: z.array(z.array(numeroOuNulo)).nullable().optional(),
  distances: z.array(z.array(numeroOuNulo)).nullable().optional(),
});

const esquemaLinha = z.object({
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

const esquemaRota = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        legs: z.array(
          z.object({
            steps: z
              .array(z.object({ geometry: esquemaLinha.optional() }).passthrough())
              .optional(),
          }),
        ),
      }),
    )
    .optional(),
});

export interface MatrizViaria {
  duracaoSegundos: number[][];
  distanciaMetros: number[][];
}

function coordenadas(pontos: readonly PontoGeografico[]): string {
  return pontos
    .map((ponto) => `${ponto.longitude.toFixed(6)},${ponto.latitude.toFixed(6)}`)
    .join(";");
}

function baseLimpa(base: string): string {
  return base.replace(/\/+$/, "");
}

function matrizNumerica(
  linhas: readonly (readonly (number | null)[])[] | null | undefined,
  tamanho: number,
): number[][] | null {
  if (!linhas || linhas.length !== tamanho) return null;
  const saida: number[][] = [];
  for (let i = 0; i < tamanho; i += 1) {
    const linha = linhas[i];
    if (!linha || linha.length !== tamanho) return null;
    const convertida: number[] = [];
    for (let j = 0; j < tamanho; j += 1) {
      const valor = linha[j];
      if (i === j) {
        convertida.push(0);
        continue;
      }
      if (valor === null || valor === undefined) return null;
      convertida.push(valor);
    }
    saida.push(convertida);
  }
  return saida;
}

/** Lê a resposta de /table. Devolve nulo se faltar tempo ou distância de algum trecho. */
export function interpretarTabelaOsrm(corpo: unknown, tamanho: number): MatrizViaria | null {
  const lido = esquemaTabela.safeParse(corpo);
  if (!lido.success || lido.data.code !== "Ok") return null;
  const duracaoSegundos = matrizNumerica(lido.data.durations, tamanho);
  const distanciaMetros = matrizNumerica(lido.data.distances, tamanho);
  if (!duracaoSegundos || !distanciaMetros) return null;
  return { duracaoSegundos, distanciaMetros };
}

function pontosDaLinha(
  coordenadasDaLinha: readonly (readonly [number, number])[],
): PontoGeografico[] {
  return coordenadasDaLinha.map(([longitude, latitude]) => ({ latitude, longitude }));
}

/**
 * Monta um desenho por perna, na ordem dos pontos pedidos.
 * A primeira perna é a viagem, a última é a volta quando `voltar`, e o meio é urbano.
 */
export function interpretarGeometriaOsrm(
  corpo: unknown,
  pernas: number,
  voltar: boolean,
): TrechoDesenhado[] | null {
  const lido = esquemaRota.safeParse(corpo);
  const rota = lido.success && lido.data.code === "Ok" ? lido.data.routes?.[0] : undefined;
  if (!rota || rota.legs.length !== pernas) return null;
  const desenhos: TrechoDesenhado[] = [];
  for (let indice = 0; indice < rota.legs.length; indice += 1) {
    const perna = rota.legs[indice];
    const passos = perna?.steps ?? [];
    const pontos: PontoGeografico[] = [];
    for (const passo of passos) {
      const linha = passo.geometry?.coordinates;
      if (!linha || linha.length === 0) return null;
      const trecho = pontosDaLinha(linha);
      if (pontos.length > 0) trecho.shift();
      pontos.push(...trecho);
    }
    if (pontos.length < 2) return null;
    const tipo: TipoDeTrecho =
      indice === 0 ? "viagem" : voltar && indice === rota.legs.length - 1 ? "volta" : "urbano";
    desenhos.push({ tipo, pontos });
  }
  return desenhos;
}

async function consultar(url: string): Promise<unknown | null> {
  try {
    const resposta = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TEMPO_MS),
    });
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

/** Matriz de duração e distância por ruas. Nulo quando o serviço não responde por completo. */
export async function matrizOsrm(
  base: string,
  pontos: readonly PontoGeografico[],
): Promise<MatrizViaria | null> {
  if (pontos.length < 2) return null;
  const url = `${baseLimpa(base)}/table/v1/driving/${coordenadas(pontos)}?annotations=duration,distance`;
  return interpretarTabelaOsrm(await consultar(url), pontos.length);
}

/** Traçado por ruas na ordem dos pontos. O último ponto repetido é a volta à origem. */
export async function geometriaOsrm(
  base: string,
  pontos: readonly PontoGeografico[],
  voltar: boolean,
): Promise<TrechoDesenhado[] | null> {
  if (pontos.length < 2) return null;
  const url = `${baseLimpa(base)}/route/v1/driving/${coordenadas(pontos)}?overview=false&geometries=geojson&steps=true`;
  return interpretarGeometriaOsrm(await consultar(url), pontos.length - 1, voltar);
}
