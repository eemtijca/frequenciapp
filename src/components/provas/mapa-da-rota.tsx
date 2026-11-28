"use client";

// Mapa da rota: origem, paradas numeradas e o traçado desde a partida, com a posição do aparelho só na tela.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Box from "@mui/material/Box";
import type { PontoGeografico } from "@/domain/provas-especificas";
import type { TrechoDesenhado } from "@/domain/rota-da-prova";

interface ParadaNoMapa {
  chave: string;
  local: string;
  latitude: number;
  longitude: number;
  ordem: number;
  alunos: number;
}

interface Props {
  origem: PontoGeografico;
  paradas: readonly ParadaNoMapa[];
  geometria: readonly TrechoDesenhado[];
  /** Linha tracejada quando o traçado não veio das ruas. */
  reta: boolean;
  proximaChave: string | null;
  deixadas: ReadonlySet<string>;
  posicao: PontoGeografico | null;
  rotulo: string;
}

const ATRIBUICAO =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contribuidores';
const SERVIDOR_DE_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const CORES: Record<TrechoDesenhado["tipo"], string> = {
  viagem: "#1565c0",
  urbano: "#2e7d32",
  volta: "#6a1b9a",
};

function iconeNumerado(numero: number, destaque: boolean, deixada: boolean): L.DivIcon {
  const fundo = deixada ? "#9e9e9e" : destaque ? "#ef6c00" : "#2e7d32";
  return L.divIcon({
    className: "pino-da-rota",
    html: `<span class="pino-da-rota__numero" style="background:${fundo}">${numero}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function iconeDaOrigem(): L.DivIcon {
  return L.divIcon({
    className: "pino-da-rota",
    html: `<span class="pino-da-rota__origem" aria-hidden="true">S</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export default function MapaDaRota({
  origem,
  paradas,
  geometria,
  reta,
  proximaChave,
  deixadas,
  posicao,
  rotulo,
}: Props) {
  const recipienteRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  const vistaRef = useRef("");

  useEffect(() => {
    const recipiente = recipienteRef.current;
    if (!recipiente) return;
    const mapa = L.map(recipiente, { worldCopyJump: true });
    L.tileLayer(SERVIDOR_DE_TILES, { maxZoom: 19, attribution: ATRIBUICAO }).addTo(mapa);
    camadaRef.current = L.layerGroup().addTo(mapa);
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(recipiente);
    mapaRef.current = mapa;
    return () => {
      observador.disconnect();
      mapa.remove();
      mapaRef.current = null;
      camadaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    const camada = camadaRef.current;
    if (!mapa || !camada) return;
    camada.clearLayers();
    const limites: L.LatLngExpression[] = [[origem.latitude, origem.longitude]];
    for (const trecho of geometria) {
      const linha = trecho.pontos.map(
        (ponto) => [ponto.latitude, ponto.longitude] as L.LatLngExpression,
      );
      if (linha.length < 2) continue;
      L.polyline(linha, {
        color: CORES[trecho.tipo],
        weight: trecho.tipo === "viagem" ? 5 : 4,
        opacity: 0.9,
        dashArray: reta ? "8 8" : undefined,
      }).addTo(camada);
      limites.push(...linha);
    }
    L.marker([origem.latitude, origem.longitude], {
      icon: iconeDaOrigem(),
      keyboard: false,
      title: "Partida",
    }).addTo(camada);
    for (const parada of paradas) {
      limites.push([parada.latitude, parada.longitude]);
      L.marker([parada.latitude, parada.longitude], {
        icon: iconeNumerado(
          parada.ordem,
          parada.chave === proximaChave,
          deixadas.has(parada.chave),
        ),
        keyboard: false,
        title: `${parada.ordem}. ${parada.local}`,
      }).addTo(camada);
    }
    if (posicao) {
      limites.push([posicao.latitude, posicao.longitude]);
      L.circleMarker([posicao.latitude, posicao.longitude], {
        radius: 8,
        color: "#0d47a1",
        fillColor: "#42a5f5",
        fillOpacity: 0.95,
        weight: 2,
      }).addTo(camada);
    }
    const vista = `${origem.latitude},${origem.longitude}|${paradas.map((parada) => parada.chave).join(",")}|${reta}|${geometria.length}`;
    if (limites.length > 0 && vistaRef.current !== vista) {
      vistaRef.current = vista;
      mapa.fitBounds(L.latLngBounds(limites), { padding: [24, 24], maxZoom: 15 });
    }
  }, [origem, paradas, geometria, reta, proximaChave, deixadas, posicao]);

  return (
    <Box
      ref={recipienteRef}
      role="img"
      aria-label={rotulo}
      sx={{
        height: { xs: 280, sm: 360 },
        borderRadius: 1,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        "& .pino-da-rota": { background: "transparent", border: 0 },
        "& .pino-da-rota__numero, & .pino-da-rota__origem": {
          display: "grid",
          placeItems: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          color: "#fff",
          fontWeight: 700,
          border: "2px solid #fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        },
        "& .pino-da-rota__origem": { background: "#1565c0" },
      }}
    />
  );
}
