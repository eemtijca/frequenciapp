"use client";

// Sincroniza a preferência do next-themes com o modo de cor do Material UI.
import { useEffect } from "react";
import { useColorScheme } from "@mui/material/styles";
import { useTheme } from "next-themes";

export type ModoTema = "light" | "dark" | "system";

const MODOS: readonly ModoTema[] = ["light", "dark", "system"];

/** Converte a preferência salva em um modo conhecido, descartando valores vazios. */
export function normalizarModoTema(valor: string | undefined | null): ModoTema | undefined {
  return MODOS.find((modo) => modo === valor);
}

/** Mantém o atributo de cor do MUI alinhado ao tema escolhido no next-themes. */
export function SincronizarTema() {
  const { theme } = useTheme();
  const { mode, setMode } = useColorScheme();
  const preferencia = normalizarModoTema(theme);

  useEffect(() => {
    if (!preferencia || preferencia === mode) return;
    setMode(preferencia);
  }, [preferencia, mode, setMode]);

  return null;
}
