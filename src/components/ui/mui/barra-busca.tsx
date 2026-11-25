"use client";

// Campo de busca com ícone, limpeza acessível e altura de alvo de toque.
import type { ChangeEvent } from "react";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import type { SxProps, Theme } from "@mui/material/styles";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { BotaoIcone } from "./botao";

export interface BarraBuscaProps {
  id: string;
  valor: string;
  onValor: (valor: string) => void;
  placeholder: string;
  rotulo?: string;
  sx?: SxProps<Theme>;
}

/** Busca controlada com lupa, limpeza e rótulo acessível no próprio campo. */
export function BarraBusca({
  id,
  valor,
  onValor,
  placeholder,
  rotulo = placeholder,
  sx,
}: BarraBuscaProps) {
  function alterar(evento: ChangeEvent<HTMLInputElement>) {
    onValor(evento.target.value);
  }

  return (
    <TextField
      id={id}
      type="search"
      value={valor}
      onChange={alterar}
      placeholder={placeholder}
      autoComplete="off"
      fullWidth
      slotProps={{
        htmlInput: {
          "aria-label": rotulo,
          spellCheck: false,
        },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" aria-hidden="true" />
            </InputAdornment>
          ),
          endAdornment: valor ? (
            <InputAdornment position="end">
              <BotaoIcone
                rotulo="Limpar busca"
                icone={<ClearRoundedIcon fontSize="small" />}
                variante="texto"
                tamanho="pequeno"
                edge="end"
                onClick={() => onValor("")}
              />
            </InputAdornment>
          ) : undefined,
        },
      }}
      sx={[
        (theme) => ({
          minWidth: 0,
          "& .MuiOutlinedInput-root": {
            height: TOKENS_LAYOUT.alvoToque,
            minHeight: TOKENS_LAYOUT.alvoToque,
            backgroundColor: theme.vars.palette.background.paper,
          },
          "& .MuiInputBase-input": {
            paddingTop: 0,
            paddingBottom: 0,
          },
          "& .MuiInputAdornment-root": {
            color: theme.vars.palette.text.secondary,
          },
          "& input[type='search']::-webkit-search-cancel-button": {
            display: "none",
          },
          "& input[type='search']::-webkit-search-decoration": {
            display: "none",
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
