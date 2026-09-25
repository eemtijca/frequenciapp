"use client";

// Mantém a cor da barra do navegador igual ao tema aplicado na troca manual.
import { useEffect } from "react";
import { useTheme } from "next-themes";

const CORES = { light: "#f9f7f2", dark: "#1c1b19" } as const;

export default function CorDoTema() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const escuro = resolvedTheme === "dark";
    const cor = escuro ? CORES.dark : CORES.light;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) return;
    metas.forEach((meta) => meta.setAttribute("content", cor));
  }, [resolvedTheme]);

  return null;
}
