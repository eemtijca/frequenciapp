"use client";

// Esquema de cores do Material UI: leitura tolerante ao modo ainda indefinido
// e sincronização da cor da barra do navegador com o esquema aplicado.
import { useEffect } from "react";
import { useColorScheme } from "@mui/material/styles";
import { CORES_NAVEGADOR } from "./paleta";

export interface EsquemaCores {
  /** Preferência escolhida: claro, escuro ou sistema; indefinida antes da hidratação. */
  mode: "light" | "dark" | "system" | undefined;
  /** Esquema efetivo aplicado na página, quando já conhecido. */
  esquemaAtual: "light" | "dark" | undefined;
  /** Preferência do sistema, disponível apenas no modo sistema. */
  systemMode: "light" | "dark" | undefined;
  /** Indica que o cliente já resolveu a preferência e pode renderizar o seletor. */
  pronto: boolean;
  definirModo: (modo: "light" | "dark" | "system" | null) => void;
}

export function useEsquemaCores(): EsquemaCores {
  const { mode, systemMode, setMode } = useColorScheme();
  const esquemaAtual = mode === "system" ? systemMode : mode;

  return {
    mode,
    esquemaAtual,
    systemMode,
    pronto: mode !== undefined && esquemaAtual !== undefined,
    definirModo: setMode,
  };
}

/** Mantém a meta theme-color coerente com o esquema claro ou escuro em uso. */
export function CorDoTema() {
  const { esquemaAtual } = useEsquemaCores();

  useEffect(() => {
    if (!esquemaAtual) return;
    const cor = esquemaAtual === "dark" ? CORES_NAVEGADOR.escuro : CORES_NAVEGADOR.claro;
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    metas.forEach((meta) => meta.setAttribute("content", cor));
  }, [esquemaAtual]);

  return null;
}
