"use client";

// Interruptor com rótulo associado, descrição opcional e alvo de toque de 48 dp.
import { useId } from "react";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Switch from "@mui/material/Switch";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";

export interface InterruptorProps {
  id?: string;
  checked: boolean;
  onChange: (marcado: boolean) => void;
  rotulo: string;
  descricao?: string;
  disabled?: boolean;
}

export function Interruptor({
  id,
  checked,
  onChange,
  rotulo,
  descricao,
  disabled,
}: InterruptorProps) {
  const campo = useCampo();
  const idGerado = useId();
  const idFinal = campo?.id ?? id ?? idGerado;
  const idDescricao = descricao ? `${idFinal}-interruptor-descricao` : undefined;
  const descritoPor = [campo?.descritoPor, idDescricao].filter(Boolean).join(" ") || undefined;
  const desabilitado = disabled ?? campo?.disabled ?? false;

  return (
    <FormControl disabled={desabilitado} sx={{ width: "100%" }}>
      <FormControlLabel
        control={
          <Switch
            id={idFinal}
            checked={checked}
            onChange={(evento) => onChange(evento.target.checked)}
            disabled={desabilitado}
            slotProps={{ input: { "aria-describedby": descritoPor } }}
          />
        }
        label={rotulo}
        sx={{
          minHeight: TOKENS_LAYOUT.alvoToque,
          m: 0,
          width: "100%",
          justifyContent: "space-between",
        }}
      />
      {descricao ? (
        <FormHelperText id={idDescricao} sx={{ mt: 0 }}>
          {descricao}
        </FormHelperText>
      ) : null}
    </FormControl>
  );
}
