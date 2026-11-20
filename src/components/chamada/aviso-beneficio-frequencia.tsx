"use client";

// Alerta de benefício na Chamada: resumo curto e números em linhas separadas.
import { useId, useState } from "react";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { BotaoIcone } from "@/components/ui/mui/botao";
import { Popover } from "@/components/ui/mui/popover";
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";
import {
  frasesDoAlerta,
  RODAPE_ALERTA_BENEFICIO,
} from "@/components/chamada/frases-aviso-beneficio";

interface Props {
  nome: string;
  alertas: AlertaFrequenciaBeneficio[];
}

const percentual = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function AvisoBeneficioFrequencia({ nome, alertas }: Props) {
  const tituloId = useId();
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null);
  const beneficios = alertas.map((alerta) => alerta.beneficioNome).join(", ");
  const aberto = ancora !== null;

  return (
    <>
      <BotaoIcone
        rotulo={`Atenção: ${nome} passou do limite de faltas do mês. ${beneficios}.`}
        title={`Acima do limite de faltas: ${beneficios}`}
        variante="texto"
        tamanho="pequeno"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        icone={<WarningAmberRoundedIcon fontSize="small" sx={{ color: "inherit" }} />}
        onClick={(evento) => setAncora(evento.currentTarget)}
        sx={(theme) => ({
          position: "relative",
          zIndex: 10,
          minWidth: 32,
          minHeight: 32,
          borderRadius: "999px",
          p: 0.75,
          backgroundColor: theme.vars.palette.alerta.fraco,
          color: theme.vars.palette.alerta.texto,
          "&:hover": {
            backgroundColor: theme.vars.palette.alerta.main,
            color: theme.vars.palette.alerta.contrastText,
          },
        })}
      />
      <Popover
        aberto={aberto}
        ancora={ancora}
        onFechar={() => setAncora(null)}
        posicao="inferior-inicio"
        rotuloId={tituloId}
      >
        <Box
          data-slot="popover-content"
          data-state={aberto ? "open" : "closed"}
          sx={{
            width: "min(20rem, calc(100vw - 3rem))",
            maxHeight: "min(70vh, 32rem)",
            overflowY: "auto",
            fontSize: "0.875rem",
          }}
        >
          <Box sx={{ pb: 1.5 }}>
            <Typography id={tituloId} component="p" sx={{ fontWeight: 600 }}>
              {alertas.length === 1 ? alertas[0]?.beneficioNome : "Benefícios"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {alertas.length === 1 ? "Limite mensal de faltas" : beneficios}
            </Typography>
          </Box>
          <Divider />
          {alertas.map((alerta) => {
            const frases = frasesDoAlerta(alerta);
            const numeros = frases.numeros;
            return (
              <Box key={alerta.beneficioId} data-aviso-beneficio sx={{ py: 1.5 }}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "flex-end", justifyContent: "space-between" }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
                      Frequência estimada
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                    >
                      {percentual.format(numeros.frequencia)}%
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Mínimo {numeros.percentualMinimo}%
                  </Typography>
                </Stack>
                <Box
                  component="dl"
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 1,
                    m: 0,
                    mt: 1,
                  }}
                >
                  <Box
                    sx={(theme) => ({
                      borderRadius: 1.5,
                      backgroundColor: theme.vars.palette.action.hover,
                      px: 1.25,
                      py: 1,
                    })}
                  >
                    <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                      Faltas
                    </Typography>
                    <Typography
                      component="dd"
                      variant="caption"
                      sx={{ m: 0, mt: 0.25, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                    >
                      {numeros.aulasFaltadas} de {numeros.horasLetivas} aulas
                    </Typography>
                  </Box>
                  <Box
                    sx={(theme) => ({
                      borderRadius: 1.5,
                      backgroundColor: theme.vars.palette.action.hover,
                      px: 1.25,
                      py: 1,
                    })}
                  >
                    <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                      Limite
                    </Typography>
                    <Typography
                      component="dd"
                      variant="caption"
                      sx={{ m: 0, mt: 0.25, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                    >
                      {numeros.limiteFaltas} {numeros.limiteFaltas === 1 ? "aula" : "aulas"}
                    </Typography>
                  </Box>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 1,
                    fontWeight: numeros.resto < 0 ? 500 : 400,
                    color: numeros.resto < 0 ? "falta.texto" : "text.secondary",
                  }}
                >
                  {frases.margem}
                </Typography>
                {frases.justificadas ? (
                  <Typography
                    variant="caption"
                    sx={{ display: "block", mt: 0.5, color: "text.secondary" }}
                  >
                    {frases.justificadas}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
          <Divider />
          <Typography variant="caption" component="p" sx={{ mt: 1.5, color: "text.secondary" }}>
            {RODAPE_ALERTA_BENEFICIO}
          </Typography>
        </Box>
      </Popover>
    </>
  );
}
