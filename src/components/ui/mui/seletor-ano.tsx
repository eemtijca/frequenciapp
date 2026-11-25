"use client";

// Seletor de ano entre 1900 e 2199 com busca, teclado e rótulo acessível.
import { useMemo } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";

export const ANO_MINIMO = 1900;
export const ANO_MAXIMO = 2199;

export function gerarAnos(min: number = ANO_MINIMO, max: number = ANO_MAXIMO): number[] {
  const inicio = Math.min(min, max);
  const fim = Math.max(min, max);
  return Array.from({ length: fim - inicio + 1 }, (_, indice) => inicio + indice);
}

export interface SeletorAnoProps {
  id?: string;
  valor: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  rotuloAcessivel: string;
  onValor: (valor: string) => void;
}

export function SeletorAno({
  id,
  valor,
  min = ANO_MINIMO,
  max = ANO_MAXIMO,
  disabled,
  rotuloAcessivel,
  onValor,
}: SeletorAnoProps) {
  const campo = useCampo();
  const idFinal = campo?.id ?? id;
  const desabilitado = disabled ?? campo?.disabled ?? false;
  const inicio = Math.min(min, max);
  const fim = Math.max(min, max);
  const anos = useMemo(() => gerarAnos(inicio, fim), [inicio, fim]);
  const numero = Number(valor);
  const selecionado = Number.isInteger(numero) && numero >= inicio && numero <= fim ? numero : null;

  return (
    <Autocomplete
      id={idFinal}
      options={anos}
      value={selecionado ?? undefined}
      onChange={(_evento, novo) => {
        if (novo !== null) onValor(String(novo));
      }}
      getOptionLabel={(ano) => String(ano)}
      isOptionEqualToValue={(ano, atual) => ano === atual}
      disableClearable
      fullWidth
      disabled={desabilitado}
      noOptionsText="Nenhum ano encontrado."
      loadingText="Carregando anos"
      clearText="Limpar"
      closeText="Fechar"
      openText="Abrir"
      slotProps={{
        paper: { sx: { mt: 0.5 } },
        listbox: { sx: { maxHeight: 320 } },
      }}
      sx={(tema) => ({
        width: "100%",
        "& .MuiOutlinedInput-root": {
          minHeight: TOKENS_LAYOUT.campo.medio,
          borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
        },
        "& .MuiOutlinedInput-root.Mui-focused": {
          boxShadow: `0 0 0 ${TOKENS_LAYOUT.campo.foco}px color-mix(in srgb, ${tema.vars.palette.primary.main} 24%, transparent)`,
        },
      })}
      renderInput={(params) => (
        <TextField
          {...params}
          id={idFinal ?? params.id}
          placeholder="Ano"
          error={Boolean(campo?.erro)}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps.htmlInput,
              "aria-label": rotuloAcessivel,
              "aria-describedby": campo?.descritoPor,
            },
          }}
        />
      )}
    />
  );
}
