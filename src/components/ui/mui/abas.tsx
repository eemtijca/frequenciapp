"use client";

// Abas MUI com painéis visitados preservados, inertes fora de foco e vínculo ARIA completo.
import { useId, useState, type ReactElement, type ReactNode, type SyntheticEvent } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { TOKENS_LAYOUT } from "@/theme/layout";

export type VarianteAbas = "scrollable" | "standard" | "fullWidth";

export interface ItemAba<T extends string = string> {
  valor: T;
  rotulo: string | ReactElement;
  conteudo: ReactNode;
  icone?: string | ReactElement;
  desabilitado?: boolean;
}

export interface AbasProps<T extends string> {
  itens: readonly ItemAba<T>[];
  ativo: T;
  onChange: (valor: T) => void;
  rotuloAcessivel: string;
  variant?: VarianteAbas;
  dataPager?: string;
}

export function Abas<T extends string>({
  itens,
  ativo,
  onChange,
  rotuloAcessivel,
  variant = "scrollable",
  dataPager,
}: AbasProps<T>) {
  const baseId = useId();
  const [visitados, setVisitados] = useState<ReadonlySet<T>>(() => new Set<T>([ativo]));

  function trocar(_evento: SyntheticEvent, valor: unknown) {
    const item = itens.find((candidato) => candidato.valor === valor);
    if (!item || item.desabilitado) return;
    setVisitados((atuais) => {
      if (atuais.has(item.valor)) return atuais;
      const proximos = new Set(atuais);
      proximos.add(item.valor);
      return proximos;
    });
    onChange(item.valor);
  }

  const idAba = (valor: T) => `${baseId}-aba-${valor}`;
  const idPainel = (valor: T) => `${baseId}-painel-${valor}`;

  return (
    <Box sx={{ minWidth: 0 }}>
      <Tabs
        value={ativo}
        onChange={trocar}
        variant={variant}
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label={rotuloAcessivel}
        sx={(tema) => ({
          minHeight: TOKENS_LAYOUT.alvoToque,
          borderBottom: `1px solid ${tema.vars.palette.divider}`,
        })}
      >
        {itens.map((item) => (
          <Tab
            key={item.valor}
            value={item.valor}
            label={item.rotulo}
            icon={item.icone}
            iconPosition={item.icone ? "start" : undefined}
            disabled={item.desabilitado}
            id={idAba(item.valor)}
            aria-controls={idPainel(item.valor)}
          />
        ))}
      </Tabs>
      <Box data-pager={dataPager} sx={{ minWidth: 0 }}>
        {itens.map((item) => {
          const selecionado = item.valor === ativo;
          if (!selecionado && !visitados.has(item.valor)) return null;
          return (
            <Box
              key={item.valor}
              id={idPainel(item.valor)}
              role="tabpanel"
              aria-labelledby={idAba(item.valor)}
              aria-hidden={!selecionado}
              hidden={!selecionado}
              inert={!selecionado}
              tabIndex={0}
              sx={(tema) => ({
                minWidth: 0,
                "&:focus-visible": {
                  outline: `3px solid ${tema.vars.palette.primary.main}`,
                  outlineOffset: 2,
                },
              })}
            >
              {item.conteudo}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
