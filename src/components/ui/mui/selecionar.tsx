"use client";

// Seletor de lista com Select do MUI, placeholder, ariaLabel e descrição vinda do Campo.
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
  quebrarRotulosDasOpcoes = false,
  mostrarRotuloSelecionado = false,
}: SelecionarProps) {
  const campo = useCampo();
  const idFinal = campo?.id ?? id;

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
      inputProps={{ "aria-label": ariaLabel, "aria-describedby": campo?.descritoPor }}
      renderValue={(atual) => {
        if (atual === "") {
          return (
            <Box component="span" sx={{ color: "text.secondary" }}>
              {placeholder}
            </Box>
          );
        }
        return opcoes.find((opcao) => opcao.valor === atual)?.rotulo ?? atual;
      }}
      sx={(tema) => ({
        minHeight: TOKENS_LAYOUT.campo.medio,
        borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        "& .MuiSelect-select": { minHeight: 0, py: 2 },
        ...(quebrarRotuloSelecionado && {
          // A especificidade extra reserva o espaço do indicador no Select outlined.
          "&& .MuiSelect-select.MuiSelect-select": {
            display: "block",
            paddingInlineEnd: tema.spacing(6),
            whiteSpace: "normal",
            overflowWrap: "anywhere",
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
