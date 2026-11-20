// Cobertura das chamadas com barra ponderada pelos alunos e pendências por turma.
import { useId } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import type { CoberturaTurmaDia } from "@/domain/relatorios";
import { BarraProgresso } from "@/components/ui/mui/barra-progresso";
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoTitulo } from "@/components/ui/mui/cartao";
import { IndicadorFeriado } from "@/components/painel/indicador-feriado";

const TEXTO_OCULTO = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

interface Props {
  turmas: CoberturaTurmaDia[];
  feriado?: string;
}

export function IndicadorCobertura({ turmas, feriado }: Props) {
  const descricaoId = useId();
  if (feriado) {
    return (
      <Cartao role="group" aria-label="Cobertura do dia">
        <CartaoCabecalho>
          <CartaoTitulo>Cobertura do dia</CartaoTitulo>
        </CartaoCabecalho>
        <CartaoConteudo>
          <IndicadorFeriado nome={feriado} />
          <Typography sx={TEXTO_OCULTO}>Não há chamadas pendentes nesta data.</Typography>
        </CartaoConteudo>
      </Cartao>
    );
  }
  const esperados = turmas.reduce((total, item) => total + item.esperados, 0);
  const registrados = turmas.reduce(
    (total, item) => total + (item.concluida ? item.esperados : 0),
    0,
  );
  const turmasPendentes = turmas.filter((item) => !item.concluida).map((item) => item.turma);
  const progresso =
    esperados > 0 ? Math.min(100, Math.max(0, Math.floor((registrados * 100) / esperados))) : 0;
  const contagem = `${registrados} de ${esperados} alunos com chamada salva`;

  return (
    <Cartao role="group" aria-label="Cobertura do dia">
      <CartaoCabecalho>
        <CartaoTitulo>Cobertura do dia</CartaoTitulo>
      </CartaoCabecalho>
      <CartaoConteudo>
        <Stack spacing={1}>
          <Typography
            aria-hidden="true"
            variant="h4"
            sx={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
              color: "primary.main",
            }}
          >
            {progresso}%
          </Typography>
          <BarraProgresso
            valor={progresso}
            rotulo="Alunos com chamada salva"
            descricao={esperados > 0 ? contagem : "Nenhum aluno ativo cadastrado"}
            descritoPor={esperados > 0 ? descricaoId : undefined}
            testId="cobertura-preenchida"
          />
          <Typography id={descricaoId} sx={TEXTO_OCULTO}>
            {turmas
              .map((item) => `${item.turma.rotulo}: ${item.concluida ? "concluída" : "pendente"}`)
              .join("; ")}
          </Typography>
          {esperados === 0 ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Sem alunos
            </Typography>
          ) : turmasPendentes.length === 0 ? (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
              <Typography variant="caption" sx={{ color: "primary.main" }}>
                Concluída
              </Typography>
            </Stack>
          ) : null}
        </Stack>
        {esperados > 0 && turmasPendentes.length > 0 && (
          <Accordion
            disableGutters
            elevation={0}
            sx={{
              "&:before": { display: "none" },
              backgroundColor: "transparent",
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 0, minHeight: 44 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                <AccessTimeRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ color: "falta.texto" }}>
                  {turmasPendentes.length}{" "}
                  {turmasPendentes.length === 1 ? "turma pendente" : "turmas pendentes"}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              <Box
                component="ul"
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.75,
                  listStyle: "none",
                  m: 0,
                  p: 0,
                }}
              >
                {turmasPendentes.map((turma) => (
                  <Box
                    component="li"
                    key={turma.id}
                    sx={(theme) => ({
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      backgroundColor: theme.vars.palette.falta.fraco,
                      color: theme.vars.palette.falta.texto,
                      fontSize: "0.75rem",
                      fontWeight: 500,
                    })}
                  >
                    {turma.rotulo}
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </CartaoConteudo>
    </Cartao>
  );
}
