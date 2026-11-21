"use client";

// Campo de texto controlado em OutlinedInput, com 56 ou 40 dp, raio de 8 e anel de foco de 3 px.
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import OutlinedInput from "@mui/material/OutlinedInput";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";

export type TipoCampoTexto = "text" | "email" | "password" | "search" | "tel" | "url";
export type TamanhoCampoTexto = "medio" | "pequeno";

export interface CampoTextoProps {
  id?: string;
  valor: string;
  onValor: (valor: string) => void;
  tipo?: TipoCampoTexto;
  placeholder?: string;
  disabled?: boolean;
  erro?: string;
  name?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  readOnly?: boolean;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  ariaLabel?: string;
  tamanho?: TamanhoCampoTexto;
  endAdornment?: ReactNode;
}

export function CampoTexto({
  id,
  valor,
  onValor,
  tipo = "text",
  placeholder,
  disabled,
  erro,
  name,
  autoComplete,
  autoFocus,
  required,
  readOnly,
  inputMode,
  maxLength,
  ariaLabel,
  tamanho = "medio",
  endAdornment,
}: CampoTextoProps) {
  const campo = useCampo();
  const idGerado = useId();
  const idFinal = campo?.id ?? id ?? idGerado;
  const altura = tamanho === "pequeno" ? TOKENS_LAYOUT.campo.pequeno : TOKENS_LAYOUT.campo.medio;
  const erroProp = erro === undefined ? undefined : Boolean(erro);

  return (
    <OutlinedInput
      id={idFinal}
      value={valor}
      onChange={(evento) => onValor(evento.target.value)}
      type={tipo}
      placeholder={placeholder}
      disabled={disabled ?? campo?.disabled}
      error={erroProp}
      name={name}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      required={required}
      readOnly={readOnly}
      endAdornment={endAdornment}
      fullWidth
      size={tamanho === "pequeno" ? "small" : "medium"}
      slotProps={{
        input: {
          "aria-label": ariaLabel,
          "aria-describedby": campo?.descritoPor,
          inputMode,
          maxLength,
        },
      }}
      sx={{ width: "100%", minHeight: altura }}
    />
  );
}
