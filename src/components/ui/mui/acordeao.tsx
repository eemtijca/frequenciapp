"use client";

// Acordeão MUI com título, resumo, conteúdo e vínculo ARIA entre cabeçalho e região.
import { useId, type ReactNode } from "react";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TOKENS_LAYOUT } from "@/theme/layout";

export type NivelTituloAcordeao = "h2" | "h3" | "h4" | "h5" | "h6";

interface AcordeaoProps {
  titulo: string;
  resumo?: ReactNode;
  children: ReactNode;
  aberto?: boolean;
  onChange?: (aberto: boolean) => void;
  nivelTitulo?: NivelTituloAcordeao;
}

export function Acordeao({
  titulo,
  resumo,
  children,
  aberto,
  onChange,
  nivelTitulo = "h3",
}: AcordeaoProps) {
  const baseId = useId();
  const idCabecalho = `${baseId}-cabecalho`;
  const idConteudo = `${baseId}-conteudo`;
  const idResumo = `${baseId}-resumo`;

  return (
    <Accordion
      expanded={aberto}
      onChange={(_evento, expandido) => onChange?.(expandido)}
      slotProps={{ heading: { component: nivelTitulo } }}
      sx={{ minWidth: 0 }}
    >
      <AccordionSummary
        id={idCabecalho}
        aria-controls={idConteudo}
        aria-describedby={resumo ? idResumo : undefined}
        expandIcon={<ExpandMoreRoundedIcon />}
        sx={{ minHeight: TOKENS_LAYOUT.lista.duasLinhas }}
      >
        <Stack component="span" sx={{ minWidth: 0 }}>
          <Typography component="span" variant="subtitle1">
            {titulo}
          </Typography>
          {resumo ? (
            <Typography
              id={idResumo}
              component="span"
              variant="body2"
              sx={{ color: "text.secondary" }}
            >
              {resumo}
            </Typography>
          ) : null}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}
