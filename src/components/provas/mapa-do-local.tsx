"use client";

// Mapa do OpenStreetMap com um marcador arrastável: toque ou arraste escolhe o local da prova.
// Carregado sob demanda, porque o Leaflet usa window e pesa no pacote principal.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Box from "@mui/material/Box";
import { rotuloDaContagem, type PontoGeografico } from "@/domain/provas-especificas";

interface Props {
  /** Local atual; nulo mostra o mapa sem marcador. */
  ponto: PontoGeografico | null;
  /** Chamado quando o toque no mapa ou o arraste do marcador escolhe um ponto. */
  onEscolher: (ponto: PontoGeografico) => void;
  rotulo: string;
  /** Alunos que fazem prova neste lugar; o selo sobre o pino some quando é zero. */
  contagem: number;
}

/** Vista inicial sem local: o país inteiro, para a pessoa aproximar ou usar o GPS. */
const VISTA_INICIAL = { latitude: -14.2, longitude: -51.9, zoom: 4 } as const;
/** Zoom ao centralizar em um local conhecido: a quadra inteira cabe na tela. */
const ZOOM_DO_LOCAL = 17;
const ATRIBUICAO =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contribuidores';
const SERVIDOR_DE_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Pino em SVG embutido: os ícones padrão do Leaflet dependem de caminhos de arquivo que o bundler quebra.
// Com alunos no lugar, um selo numérico fica no canto do pino.
function iconeDoPino(contagem: number): L.DivIcon {
  const selo =
    contagem > 0
      ? `<span class="pino-do-local__contagem">${rotuloDaContagem(contagem)}</span>`
      : "";
  return L.divIcon({
    className: "pino-do-local",
    html: `<svg viewBox="0 0 24 34" width="32" height="44" aria-hidden="true" focusable="false"><path d="M12 1C6 1 1.5 5.6 1.5 11.3 1.5 19 12 33 12 33s10.5-14 10.5-21.7C22.5 5.6 18 1 12 1z" fill="#c62828" stroke="#ffffff" stroke-width="2"/><circle cx="12" cy="11.5" r="4" fill="#ffffff"/></svg>${selo}`,
    iconSize: [32, 44],
    iconAnchor: [16, 43],
  });
}

function tituloDoPino(contagem: number): string {
  if (contagem === 0) return "Local da prova";
  return `Local da prova: ${contagem === 1 ? "1 aluno" : `${contagem} alunos`}`;
}

/** Tolerância de dois milionésimos de grau: o texto do diálogo arredonda em seis casas. */
const TOLERANCIA_EM_GRAUS = 2e-6;

function mesmoPonto(a: PontoGeografico | null, b: PontoGeografico | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.latitude - b.latitude) < TOLERANCIA_EM_GRAUS &&
    Math.abs(a.longitude - b.longitude) < TOLERANCIA_EM_GRAUS
  );
}

export default function MapaDoLocal({ ponto, onEscolher, rotulo, contagem }: Props) {
  const recipienteRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.Marker | null>(null);
  const onEscolherRef = useRef(onEscolher);
  const contagemRef = useRef(contagem);
  // Último ponto que o próprio mapa escolheu: o efeito do ponto não recentraliza por ele.
  const escolhidoPeloMapaRef = useRef<PontoGeografico | null>(null);

  useEffect(() => {
    onEscolherRef.current = onEscolher;
    contagemRef.current = contagem;
  });

  useEffect(() => {
    const recipiente = recipienteRef.current;
    if (!recipiente) return;
    const mapa = L.map(recipiente, {
      center: [VISTA_INICIAL.latitude, VISTA_INICIAL.longitude],
      zoom: VISTA_INICIAL.zoom,
      worldCopyJump: true,
    });
    L.tileLayer(SERVIDOR_DE_TILES, { maxZoom: 19, attribution: ATRIBUICAO }).addTo(mapa);

    // O mapa se repete na horizontal; wrap() devolve a longitude à faixa de -180 a 180.
    function escolher(posicao: L.LatLng) {
      const { lat, lng } = posicao.wrap();
      const escolhido = { latitude: lat, longitude: lng };
      escolhidoPeloMapaRef.current = escolhido;
      onEscolherRef.current(escolhido);
    }
    mapa.on("click", (evento: L.LeafletMouseEvent) => escolher(evento.latlng));

    // O diálogo anima a abertura: sem isto o Leaflet mede a caixa antes do tamanho final.
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(recipiente);
    mapaRef.current = mapa;
    return () => {
      observador.disconnect();
      mapa.remove();
      mapaRef.current = null;
      marcadorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (ponto === null) {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
      return;
    }
    const posicao = L.latLng(ponto.latitude, ponto.longitude);
    let marcador = marcadorRef.current;
    if (marcador) {
      marcador.setLatLng(posicao);
    } else {
      marcador = L.marker(posicao, {
        icon: iconeDoPino(contagemRef.current),
        draggable: true,
        keyboard: false,
        title: tituloDoPino(contagemRef.current),
        alt: "Local da prova",
      }).addTo(mapa);
      marcador.on("dragend", () => {
        const solto = marcador?.getLatLng().wrap();
        if (!solto) return;
        const escolhido = { latitude: solto.lat, longitude: solto.lng };
        escolhidoPeloMapaRef.current = escolhido;
        onEscolherRef.current(escolhido);
      });
      marcadorRef.current = marcador;
    }
    // Ponto vindo de fora (GPS ou coordenada digitada): leva o mapa até ele.
    if (!mesmoPonto(escolhidoPeloMapaRef.current, ponto)) {
      mapa.setView(posicao, Math.max(mapa.getZoom(), ZOOM_DO_LOCAL));
    }
  }, [ponto]);

  // O selo acompanha a contagem sem recriar o marcador, que o arraste em curso precisa manter.
  useEffect(() => {
    const marcador = marcadorRef.current;
    if (!marcador) return;
    marcador.setIcon(iconeDoPino(contagem));
    marcador.getElement()?.setAttribute("title", tituloDoPino(contagem));
  }, [contagem]);

  return (
    <Box
      ref={recipienteRef}
      role="group"
      aria-label={rotulo}
      sx={{
        position: "relative",
        isolation: "isolate",
        zIndex: 0,
        width: "100%",
        height: { xs: "42dvh", sm: 360 },
        minHeight: 260,
        borderRadius: 2,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        bgcolor: "action.hover",
        "& .pino-do-local": { background: "transparent", border: 0 },
        "& .pino-do-local__contagem": {
          position: "absolute",
          top: -6,
          right: -16,
          boxSizing: "border-box",
          minWidth: 24,
          height: 24,
          padding: "0 6px",
          borderRadius: 12,
          border: "2px solid #ffffff",
          background: "#1b5e20",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.35)",
          color: "#ffffff",
          font: "700 12px/20px system-ui, sans-serif",
          textAlign: "center",
          pointerEvents: "none",
        },
      }}
    />
  );
}
