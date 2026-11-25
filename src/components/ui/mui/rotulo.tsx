"use client";

// Rótulo acessível de campos, com vínculo ao controle e indicação de obrigatório.
import FormLabel, { type FormLabelProps } from "@mui/material/FormLabel";

export type RotuloProps = Omit<FormLabelProps, "component" | "className"> & {
  /** Marca o campo como obrigatório sem depender apenas da cor. */
  obrigatorio?: boolean;
};

/** Rótulo de formulário equivalente ao FormLabel, com o vínculo e o foco do tema. */
export function Rotulo({ obrigatorio = false, children, sx, ...props }: RotuloProps) {
  return (
    <FormLabel
      component="label"
      {...props}
      sx={[
        (theme) => ({
          display: "block",
          color: theme.vars.palette.text.secondary,
          mb: 1,
          "&.Mui-error": { color: theme.vars.palette.error.main },
          "&.Mui-focused": { color: theme.vars.palette.primary.main },
          "&.Mui-disabled": { color: theme.vars.palette.text.disabled },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
      {obrigatorio ? <span aria-hidden="true"> *</span> : null}
    </FormLabel>
  );
}

export { Rotulo as FormLabel };
