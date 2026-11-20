"use client";

// Grupo exclusivo de opções com semântica de rádio, teclado e alvo de 48 dp.
import type { KeyboardEvent, MouseEvent } from "react";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import type { SxProps, Theme } from "@mui/material/styles";
import { RAIOS, TOKENS_LAYOUT } from "@/theme/layout";

export interface OpcaoGrupo<T extends string> {
  valor: T;
  rotulo: string;
  disabled?: boolean;
}

export interface GrupoOpcoesProps<T extends string> {
  rotulo: string;
  valor: T;
  opcoes: readonly OpcaoGrupo<T>[];
  onValor: (valor: T) => void;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** Opções mutuamente exclusivas em botões alternáveis, sem permitir desmarcar. */
export function GrupoOpcoes<T extends string>({
  rotulo,
  valor,
  opcoes,
  onValor,
  disabled = false,
  sx,
}: GrupoOpcoesProps<T>) {
  function trocar(_evento: MouseEvent<HTMLElement>, novo: T | null) {
    if (novo === null) return;
    const opcao = opcoes.find((item) => item.valor === novo);
    if (!opcao || opcao.disabled || disabled) return;
    onValor(novo);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (disabled || evento.altKey || evento.shiftKey || evento.ctrlKey || evento.metaKey) return;
    const atual = opcoes.findIndex((opcao) => opcao.valor === valor);
    if (atual < 0 || opcoes.length === 0) return;
    const avancar = evento.key === "ArrowRight" || evento.key === "ArrowDown";
    const voltar = evento.key === "ArrowLeft" || evento.key === "ArrowUp";
    if (!avancar && !voltar && evento.key !== "Home" && evento.key !== "End") return;
    const inicio =
      evento.key === "Home"
        ? 0
        : evento.key === "End"
          ? opcoes.length - 1
          : avancar
            ? atual + 1
            : atual - 1;
    const passo = evento.key === "Home" || avancar ? 1 : -1;
    for (let tentativa = 0; tentativa < opcoes.length; tentativa += 1) {
      const indice = (inicio + tentativa * passo + opcoes.length) % opcoes.length;
      const opcao = opcoes[indice];
      if (opcao && !opcao.disabled) {
        onValor(opcao.valor);
        return;
      }
    }
  }

  return (
    <ToggleButtonGroup
      exclusive
      value={valor}
      onChange={trocar}
      onKeyDown={aoTeclar}
      role="radiogroup"
      aria-label={rotulo}
      disabled={disabled}
      sx={[
        (theme) => ({
          flexWrap: "wrap",
          gap: 1,
          "& .MuiToggleButtonGroup-grouped": {
            minHeight: TOKENS_LAYOUT.alvoToque,
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: `${RAIOS.controle}px`,
            "&:not(:first-of-type)": { marginLeft: 0 },
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {opcoes.map((opcao) => {
        const selecionada = opcao.valor === valor;
        return (
          <ToggleButton
            key={opcao.valor}
            value={opcao.valor}
            role="radio"
            aria-checked={selecionada}
            aria-pressed={undefined}
            disabled={disabled || opcao.disabled}
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque, px: 2 }}
          >
            {opcao.rotulo}
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}
