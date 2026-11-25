"use client";

// Campo de formulário com rótulo acima, contador, descrição e erro ligados por aria-describedby.
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  type ReactNode,
} from "react";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export interface ContextoCampo {
  id: string;
  idRotulo: string;
  idDescricao?: string;
  idErro?: string;
  descritoPor?: string;
  rotulo: string;
  erro?: string;
  disabled?: boolean;
}

const ContextoCampo = createContext<ContextoCampo | null>(null);

export function useCampo(): ContextoCampo | null {
  return useContext(ContextoCampo);
}

function juntarIds(...ids: Array<string | undefined>): string | undefined {
  const preenchidos = ids.filter((id): id is string => Boolean(id));
  return preenchidos.length ? preenchidos.join(" ") : undefined;
}

export interface CampoProps {
  id: string;
  rotulo: string;
  children: ReactNode;
  descricao?: string;
  erro?: string;
  contador?: string;
  disabled?: boolean;
}

export function Campo({ id, rotulo, children, descricao, erro, contador, disabled }: CampoProps) {
  const idRotulo = `${id}-rotulo`;
  const idDescricao = descricao ? `${id}-descricao` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descritoPor = juntarIds(idDescricao, idErro);
  const contexto: ContextoCampo = {
    id,
    idRotulo,
    idDescricao,
    idErro,
    descritoPor,
    rotulo,
    erro,
    disabled,
  };
  const filhos = Children.map(children, (filho) => {
    if (!descritoPor || !isValidElement<{ "aria-describedby"?: string }>(filho)) return filho;
    return cloneElement(filho, {
      "aria-describedby": juntarIds(filho.props["aria-describedby"], descritoPor),
    });
  });

  return (
    <ContextoCampo.Provider value={contexto}>
      <FormControl fullWidth error={Boolean(erro)} disabled={disabled}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1 }}
        >
          <FormLabel id={idRotulo} htmlFor={id} sx={{ mb: 0 }}>
            {rotulo}
          </FormLabel>
          {contador ? (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {contador}
            </Typography>
          ) : null}
        </Stack>
        {filhos}
        {descricao ? (
          <FormHelperText id={idDescricao} sx={{ mt: 0.5 }}>
            {descricao}
          </FormHelperText>
        ) : null}
        {erro ? (
          <FormHelperText id={idErro} error role="alert" sx={{ mt: descricao ? 0 : 0.5 }}>
            {erro}
          </FormHelperText>
        ) : null}
      </FormControl>
    </ContextoCampo.Provider>
  );
}
