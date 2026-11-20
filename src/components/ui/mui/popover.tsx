"use client";

// Popover modal posicionado pela âncora, com foco contido e retorno de foco ao gatilho.
import type { ReactNode } from "react";
import PopoverMui, { type PopoverOrigin } from "@mui/material/Popover";
import { RAIOS } from "@/theme/layout";

export type PosicaoPopover =
  | "inferior-inicio"
  | "inferior-centro"
  | "inferior-fim"
  | "superior-inicio"
  | "superior-centro"
  | "superior-fim";

interface OrigemPopover {
  anchorOrigin: PopoverOrigin;
  transformOrigin: PopoverOrigin;
}

export const POSICOES_POPOVER: Record<PosicaoPopover, OrigemPopover> = {
  "inferior-inicio": {
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" },
  },
  "inferior-centro": {
    anchorOrigin: { vertical: "bottom", horizontal: "center" },
    transformOrigin: { vertical: "top", horizontal: "center" },
  },
  "inferior-fim": {
    anchorOrigin: { vertical: "bottom", horizontal: "right" },
    transformOrigin: { vertical: "top", horizontal: "right" },
  },
  "superior-inicio": {
    anchorOrigin: { vertical: "top", horizontal: "left" },
    transformOrigin: { vertical: "bottom", horizontal: "left" },
  },
  "superior-centro": {
    anchorOrigin: { vertical: "top", horizontal: "center" },
    transformOrigin: { vertical: "bottom", horizontal: "center" },
  },
  "superior-fim": {
    anchorOrigin: { vertical: "top", horizontal: "right" },
    transformOrigin: { vertical: "bottom", horizontal: "right" },
  },
};

interface PopoverProps {
  aberto: boolean;
  ancora: Element | null;
  onFechar: () => void;
  children: ReactNode;
  posicao?: PosicaoPopover;
  rotuloAcessivel?: string;
  rotuloId?: string;
  descricaoId?: string;
}

export function Popover({
  aberto,
  ancora,
  onFechar,
  children,
  posicao = "inferior-inicio",
  rotuloAcessivel,
  rotuloId,
  descricaoId,
}: PopoverProps) {
  const origem = POSICOES_POPOVER[posicao];

  return (
    <PopoverMui
      open={aberto}
      anchorEl={ancora}
      onClose={onFechar}
      anchorOrigin={origem.anchorOrigin}
      transformOrigin={origem.transformOrigin}
      marginThreshold={16}
      disableAutoFocus={false}
      disableEnforceFocus={false}
      disableRestoreFocus={false}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-modal": true,
          "aria-label": rotuloId ? undefined : rotuloAcessivel,
          "aria-labelledby": rotuloId,
          "aria-describedby": descricaoId,
          tabIndex: -1,
          sx: (tema) => ({
            maxWidth: "calc(100vw - 32px)",
            borderRadius: `${RAIOS.dialogo}px`,
            border: `1px solid ${tema.vars.palette.divider}`,
            backgroundImage: "none",
            padding: 2,
          }),
        },
      }}
    >
      {children}
    </PopoverMui>
  );
}
