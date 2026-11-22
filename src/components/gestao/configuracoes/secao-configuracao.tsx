// Seção de Configurações aberta, com título, explicação e estado opcional.
import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ESPACO_COMPOSICAO } from "@/theme/layout";

export default function SecaoConfiguracao({
  id,
  titulo,
  descricao,
  resumo,
  children,
}: {
  id: string;
  titulo: string;
  descricao: string;
  resumo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack component="section" data-secao={id} aria-labelledby={`${id}-titulo`} spacing={2}>
      <Stack spacing={ESPACO_COMPOSICAO.tituloDescricao} useFlexGap>
        <Typography component="h3" variant="h6" id={`${id}-titulo`}>
          {titulo}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {descricao}
        </Typography>
        {resumo ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {resumo}
          </Stack>
        ) : null}
      </Stack>
      {children}
    </Stack>
  );
}
