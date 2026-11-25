"use client";

// Rótulo passivo com data e hora da última leitura bem-sucedida da visão.
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { dataNoFuso, horaNoFuso } from "@/domain/frequencia";
import { useAtualizadoEm } from "@/components/atualizacao/contexto-atualizacao";

export interface AtualizadoEmProps {
  instante?: string;
  fuso: string;
  sx?: SxProps<Theme>;
}

/** Data e hora da leitura no fuso da escola, com estado vazio quando não há leitura. */
export function AtualizadoEm({ instante, fuso, sx }: AtualizadoEmProps) {
  const hora = instante ? horaNoFuso(instante, fuso) : "";
  const data = instante ? dataNoFuso(instante, fuso) : "";
  const texto = hora && data ? `Atualizado em ${data} às ${hora}` : "Ainda não atualizado";

  return (
    <Typography
      component="span"
      variant="caption"
      title={texto}
      sx={[
        (theme) => ({
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          color: theme.vars.palette.text.secondary,
          whiteSpace: "nowrap",
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <ScheduleRoundedIcon aria-hidden="true" sx={{ fontSize: 14, flexShrink: 0 }} />
      {texto}
    </Typography>
  );
}

export interface AtualizadoDaVisaoProps {
  fuso: string;
  sx?: SxProps<Theme>;
}

/** Versão conectada ao shell principal, que lê a visão ativa. */
export function AtualizadoDaVisao({ fuso, sx }: AtualizadoDaVisaoProps) {
  const instante = useAtualizadoEm();
  return <AtualizadoEm instante={instante} fuso={fuso} sx={sx} />;
}
