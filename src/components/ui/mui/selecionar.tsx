"use client";

// Seletor de lista com Select do MUI, placeholder, ariaLabel e descrição vinda do Campo.
import { useId } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";
import { SelecionarBuscavel } from "./selecionar-buscavel";

export interface OpcaoSelecionar {
  valor: string;
  rotulo: string;
}

export interface SelecionarProps {
  id?: string;
  valor: string;
  onValor: (valor: string) => void;
  opcoes: OpcaoSelecionar[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  buscavel?: boolean;
  quebrarRotuloSelecionado?: boolean;
  truncarRotuloSelecionado?: boolean;
  quebrarRotulosDasOpcoes?: boolean;
  mostrarRotuloSelecionado?: boolean;
}

export function Selecionar({
  id,
  valor,
  onValor,
  opcoes,
  placeholder = "Selecione",
  disabled,
  ariaLabel,
  buscavel = false,
  quebrarRotuloSelecionado = false,
  truncarRotuloSelecionado = false,
  quebrarRotulosDasOpcoes = false,
  mostrarRotuloSelecionado = false,
}: SelecionarProps) {
  const campo = useCampo();
  const idFinal = campo?.id ?? id;
  const idRotuloSelecionado = useId();

  if (buscavel) {
    return (
      <SelecionarBuscavel
        id={idFinal}
        valor={valor}
        onValor={onValor}
        opcoes={opcoes}
        placeholder={placeholder}
        disabled={disabled}
        ariaLabel={ariaLabel}
        quebrarRotulosDasOpcoes={quebrarRotulosDasOpcoes}
        mostrarRotuloSelecionado={mostrarRotuloSelecionado}
      />
    );
  }

  const desabilitado = disabled ?? campo?.disabled ?? false;
  const rotuloEmUmaLinha = truncarRotuloSelecionado && !quebrarRotuloSelecionado;
  const descritoPor =
    [campo?.descritoPor, rotuloEmUmaLinha && valor !== "" ? idRotuloSelecionado : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  function aoMudar(evento: SelectChangeEvent<string>) {
    onValor(evento.target.value);
  }

  return (
    <Select<string>
      id={idFinal}
      value={valor}
      onChange={aoMudar}
      displayEmpty
      disabled={desabilitado}
      fullWidth
      labelId={ariaLabel ? undefined : campo?.idRotulo}
      inputProps={{ "aria-label": ariaLabel, "aria-describedby": descritoPor }}
      renderValue={(atual) => {
        if (atual === "") {
          return (
            <Box component="span" sx={{ color: "text.secondary" }}>
              {placeholder}
            </Box>
          );
        }
        const rotulo = opcoes.find((opcao) => opcao.valor === atual)?.rotulo ?? atual;
        if (!rotuloEmUmaLinha) return rotulo;
        return (
          <Box
            component="span"
            id={idRotuloSelecionado}
            sx={{
              display: "block",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {rotulo}
          </Box>
        );
      }}
      sx={(tema) => ({
        minHeight: TOKENS_LAYOUT.campo.medio,
        borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        "& .MuiSelect-select": { minHeight: 0, py: 2 },
        ...((quebrarRotuloSelecionado || rotuloEmUmaLinha) && {
          // A especificidade extra reserva o espaço do indicador no Select outlined.
          "&& .MuiSelect-select.MuiSelect-select": {
            paddingInlineEnd: tema.spacing(6),
            ...(quebrarRotuloSelecionado && {
              display: "block",
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            }),
          },
        }),
      })}
    >
      {opcoes.length === 0 ? (
        <MenuItem disabled value="">
          Nenhuma opção encontrada.
        </MenuItem>
      ) : (
        opcoes.map((opcao) => (
          <MenuItem
            key={opcao.valor}
            value={opcao.valor}
            sx={{
              minHeight: TOKENS_LAYOUT.alvoToque,
              ...(quebrarRotulosDasOpcoes && { whiteSpace: "normal", overflowWrap: "anywhere" }),
            }}
          >
            {opcao.rotulo}
          </MenuItem>
        ))
      )}
    </Select>
  );
}
