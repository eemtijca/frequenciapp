"use client";

// Campo de senha com botão de mostrar e ocultar, rótulo alternado, aria-pressed e alvo de 48 dp.
import { useId, useState } from "react";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";
import { CampoTexto } from "./text-field";

export interface CampoSenhaProps {
  id?: string;
  valor: string;
  onValor: (valor: string) => void;
  erro?: string;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
  rotulosVisibilidade?: { mostrar: string; ocultar: string };
}

export function CampoSenha({
  id,
  valor,
  onValor,
  erro,
  disabled,
  placeholder,
  name,
  autoComplete,
  required,
  maxLength,
  rotulosVisibilidade = { mostrar: "Mostrar senha", ocultar: "Ocultar senha" },
}: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  const campo = useCampo();
  const idGerado = useId();
  const idFinal = campo?.id ?? id ?? idGerado;
  const desabilitado = disabled ?? campo?.disabled ?? false;

  return (
    <CampoTexto
      id={idFinal}
      valor={valor}
      onValor={onValor}
      tipo={visivel ? "text" : "password"}
      erro={erro}
      disabled={desabilitado}
      placeholder={placeholder}
      name={name}
      autoComplete={autoComplete}
      required={required}
      maxLength={maxLength}
      endAdornment={
        <InputAdornment position="end">
          <IconButton
            type="button"
            aria-label={visivel ? rotulosVisibilidade.ocultar : rotulosVisibilidade.mostrar}
            aria-pressed={visivel}
            aria-controls={idFinal}
            disabled={desabilitado}
            onClick={() => setVisivel((atual) => !atual)}
            onMouseDown={(evento) => evento.preventDefault()}
            onMouseUp={(evento) => evento.preventDefault()}
            sx={{
              width: TOKENS_LAYOUT.alvoToque,
              height: TOKENS_LAYOUT.alvoToque,
              border: 0,
              backgroundColor: "transparent",
              boxShadow: "none",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            {visivel ? (
              <VisibilityOff fontSize="small" aria-hidden="true" />
            ) : (
              <Visibility fontSize="small" aria-hidden="true" />
            )}
          </IconButton>
        </InputAdornment>
      }
    />
  );
}
