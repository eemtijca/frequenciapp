"use client";

// Resolve a escolha local e a preferência do dispositivo para os consumidores de movimento.
import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  ATRIBUTO_ANIMACOES,
  CHAVE_ANIMACOES,
  normalizarAnimacoes,
  type ModoAnimacoes,
} from "./preferencia-animacoes";

interface AnimacoesDaInterface {
  modo: ModoAnimacoes;
  animacoesAtivas: boolean;
  definirModo: (modo: ModoAnimacoes) => void;
}

export const ContextoAnimacoes = createContext<AnimacoesDaInterface>({
  modo: "sistema",
  animacoesAtivas: true,
  definirModo: () => undefined,
});

export function useAnimacoesDaInterface() {
  return useContext(ContextoAnimacoes);
}

function lerModo(): ModoAnimacoes {
  try {
    return normalizarAnimacoes(window.localStorage.getItem(CHAVE_ANIMACOES));
  } catch {
    return "sistema";
  }
}

const semInscricao = () => () => undefined;
const modoNoServidor = () => undefined;

export function usePreferenciaAnimacoes() {
  const gravado = useSyncExternalStore(semInscricao, lerModo, modoNoServidor);
  const [escolhido, setEscolhido] = useState<ModoAnimacoes>();
  const modo = escolhido ?? gravado ?? "sistema";
  const reduzirNoSistema = useMediaQuery("(prefers-reduced-motion: reduce)", {
    defaultMatches: true,
  });
  const animacoesAtivas = modo === "ativadas" || (modo === "sistema" && !reduzirNoSistema);

  useLayoutEffect(() => {
    if (gravado !== undefined) document.documentElement.setAttribute(ATRIBUTO_ANIMACOES, modo);
  }, [gravado, modo]);

  function definirModo(novo: ModoAnimacoes) {
    setEscolhido(novo);
    try {
      window.localStorage.setItem(CHAVE_ANIMACOES, novo);
    } catch {
      // A escolha continua valendo na sessão, mesmo sem persistência.
    }
  }

  return { modo, animacoesAtivas, definirModo, hidratado: gravado !== undefined };
}

/** Conserva a detecção de dispositivos antigos feita pelo MUI X em Sistema. */
export function useReduzirAnimacoesDosSeletores() {
  const { modo, animacoesAtivas } = useAnimacoesDaInterface();
  return modo === "sistema" && animacoesAtivas ? undefined : !animacoesAtivas;
}
