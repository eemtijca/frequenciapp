"use client";

// Troca de categoria: seletor rotulado na largura estreita e lista no desktop.
import { useLayoutEffect, useRef } from "react";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { TOKENS_LAYOUT } from "@/theme/layout";

const categorias = [
  { valor: "escola", rotulo: "Escola", icone: TuneRoundedIcon },
  { valor: "horarios", rotulo: "Horários", icone: ScheduleRoundedIcon },
  { valor: "planilhas", rotulo: "Planilhas", icone: GridOnRoundedIcon },
  { valor: "acesso", rotulo: "Acesso e avisos", icone: ShieldRoundedIcon },
  { valor: "dados", rotulo: "Dados", icone: Inventory2RoundedIcon },
] as const;

export type CategoriaConfiguracoes = (typeof categorias)[number]["valor"];

export default function NavegacaoConfiguracoes({
  categoria,
  onChange,
}: {
  categoria: CategoriaConfiguracoes;
  onChange: (valor: CategoriaConfiguracoes) => void;
}) {
  const listaLateral = useMediaQuery((tema: Theme) => tema.breakpoints.up("lg"));
  const navRef = useRef<HTMLElement>(null);
  const menuAberto = useRef(false);
  const focoNaLista = useRef(false);
  const focoNoSeletor = useRef(false);

  useLayoutEffect(() => {
    // O menu fica em um portal: ocultar apenas o gatilho não o desmonta.
    const transferirFoco = listaLateral
      ? menuAberto.current || focoNoSeletor.current
      : focoNaLista.current;
    menuAberto.current = false;
    if (!transferirFoco) return;
    const seletor = listaLateral ? '[aria-current="true"]' : '[role="combobox"]';
    navRef.current?.querySelector<HTMLElement>(seletor)?.focus();
  }, [listaLateral]);

  return (
    <Box component="nav" ref={navRef} aria-label="Categorias de configurações" sx={{ minWidth: 0 }}>
      {!listaLateral && (
        <FormControl
          fullWidth
          sx={{ display: { xs: "flex", lg: "none" } }}
          onFocusCapture={() => {
            focoNoSeletor.current = true;
          }}
          onBlurCapture={() => {
            focoNoSeletor.current = false;
          }}
        >
          <InputLabel id="rotulo-categoria-config">Categoria</InputLabel>
          <Select<CategoriaConfiguracoes>
            id="seletor-categoria-config"
            labelId="rotulo-categoria-config"
            label="Categoria"
            value={categoria}
            onOpen={() => {
              menuAberto.current = true;
            }}
            onClose={() => {
              menuAberto.current = false;
            }}
            onChange={(evento) => {
              const escolha = categorias.find(({ valor }) => valor === evento.target.value);
              if (escolha) onChange(escolha.valor);
            }}
          >
            {categorias.map(({ valor, rotulo }) => (
              <MenuItem key={valor} value={valor} sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}>
                {rotulo}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {listaLateral && (
        <List
          disablePadding
          sx={{ display: { xs: "none", lg: "block" } }}
          onFocusCapture={() => {
            focoNaLista.current = true;
          }}
          onBlurCapture={() => {
            focoNaLista.current = false;
          }}
        >
          {categorias.map(({ valor, rotulo, icone: Icone }) => (
            <ListItem key={valor} disablePadding>
              <ListItemButton
                component="button"
                type="button"
                selected={categoria === valor}
                aria-current={categoria === valor ? "true" : undefined}
                aria-controls={`config-grupo-${valor}`}
                onClick={() => onChange(valor)}
                sx={(tema) => ({
                  width: "100%",
                  textAlign: "left",
                  fontSize: tema.typography.body2.fontSize,
                  fontWeight: categoria === valor ? 700 : 500,
                  opacity: 1,
                  "&.Mui-focusVisible": {
                    outline: `3px solid ${tema.vars.palette.primary.main}`,
                    outlineOffset: -3,
                  },
                  "@media (forced-colors: active)": {
                    "&.Mui-selected, &.Mui-focusVisible": {
                      outline: "2px solid Highlight",
                      outlineOffset: -2,
                    },
                  },
                })}
              >
                <Icone fontSize="small" aria-hidden="true" />
                {rotulo}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
