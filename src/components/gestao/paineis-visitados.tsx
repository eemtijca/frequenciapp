// Monta cada painel na primeira visita e o preserva fora da árvore acessível ao sair.
import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import { LimiteLeituraDaVisao } from "@/components/layout/quadro-das-visoes";

interface Painel<T extends string> {
  valor: T;
  conteudo: ReactNode;
}

export function PaineisVisitados<T extends string>({
  ativo,
  itens,
}: {
  ativo: T;
  itens: readonly Painel<T>[];
}) {
  const [visitados, setVisitados] = useState(() => new Set([ativo]));
  if (!visitados.has(ativo)) setVisitados(new Set(visitados).add(ativo));

  return itens.map(({ valor, conteudo }) => {
    if (!visitados.has(valor)) return null;
    const oculto = valor !== ativo;
    return (
      <Box
        key={valor}
        hidden={oculto}
        inert={oculto}
        sx={{ minWidth: 0, "&[hidden]": { display: "none" } }}
      >
        <LimiteLeituraDaVisao ativo={!oculto}>{conteudo}</LimiteLeituraDaVisao>
      </Box>
    );
  });
}
