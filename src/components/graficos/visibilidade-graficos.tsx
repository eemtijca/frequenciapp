"use client";

import { createContext, useContext, type ReactNode } from "react";

const VisibilidadeGraficos = createContext(true);

/** A visibilidade de um descendente nunca pode superar a do seu ancestral. */
export function ProvedorVisibilidadeGraficos({
  visivel,
  children,
}: {
  visivel: boolean;
  children: ReactNode;
}) {
  const ancestralVisivel = useContext(VisibilidadeGraficos);
  return (
    <VisibilidadeGraficos.Provider value={ancestralVisivel && visivel}>
      {children}
    </VisibilidadeGraficos.Provider>
  );
}

export function useGraficosVisiveis() {
  return useContext(VisibilidadeGraficos);
}
