"use client";

// Limites percentuais do card de Infrequência do Painel, no rascunho da Gestão.
import { useState } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PercentRoundedIcon from "@mui/icons-material/PercentRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Configuracoes } from "@/domain/frequencia";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Selo } from "@/components/ui/mui/selo";

interface Props {
  configuracoes: Configuracoes;
  onMudar: (entrada: Partial<Configuracoes>) => void;
}

function inteiroValido(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const valor = Number(texto);
  return valor >= 0 && valor <= 100 ? valor : null;
}

const CAIXA_FAIXA = {
  paddingX: 2,
  paddingY: 1,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
} as const;

export default function SecaoInfrequencia({ configuracoes, onMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [atencaoTexto, setAtencaoTexto] = useState(
    String(configuracoes.infrequenciaAtencaoPercentual),
  );
  const [criticaTexto, setCriticaTexto] = useState(
    String(configuracoes.infrequenciaCriticaPercentual),
  );
  const [erro, setErro] = useState("");
  const [base, setBase] = useState([
    configuracoes.infrequenciaAtencaoPercentual,
    configuracoes.infrequenciaCriticaPercentual,
  ]);

  if (
    base[0] !== configuracoes.infrequenciaAtencaoPercentual ||
    base[1] !== configuracoes.infrequenciaCriticaPercentual
  ) {
    setBase([
      configuracoes.infrequenciaAtencaoPercentual,
      configuracoes.infrequenciaCriticaPercentual,
    ]);
    setAtencaoTexto(String(configuracoes.infrequenciaAtencaoPercentual));
    setCriticaTexto(String(configuracoes.infrequenciaCriticaPercentual));
  }

  function aplicar(proximoAtencao: string, proximaCritica: string) {
    const valorAtencao = inteiroValido(proximoAtencao);
    const valorCritica = inteiroValido(proximaCritica);
    if (valorAtencao === null || valorCritica === null) {
      setErro("Informe números inteiros de 0 a 100.");
      return;
    }
    if (valorAtencao >= valorCritica) {
      setErro("O limite de atenção deve ser menor que o limite crítico.");
      return;
    }
    setErro("");
    onMudar({
      infrequenciaAtencaoPercentual: valorAtencao,
      infrequenciaCriticaPercentual: valorCritica,
    });
  }

  return (
    <Box data-secao="config-infrequencia">
      <Acordeao
        titulo="Infrequência do Painel"
        resumo={
          <>
            <Selo>{`Esperado até ${configuracoes.infrequenciaAtencaoPercentual}%`}</Selo>
            <Selo>{`Atenção até ${configuracoes.infrequenciaCriticaPercentual}%`}</Selo>
          </>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { sm: "1fr 1fr" } }}>
            <Campo id="infrequencia-atencao" rotulo="Dentro do esperado até">
              <CampoTexto
                id="infrequencia-atencao"
                valor={atencaoTexto}
                onValor={(valor) => {
                  setAtencaoTexto(valor);
                  aplicar(valor, criticaTexto);
                }}
                inputMode="numeric"
                maxLength={3}
                endAdornment={
                  <InputAdornment position="end">
                    <PercentRoundedIcon fontSize="small" aria-hidden="true" />
                  </InputAdornment>
                }
              />
            </Campo>
            <Campo id="infrequencia-critica" rotulo="Atenção até">
              <CampoTexto
                id="infrequencia-critica"
                valor={criticaTexto}
                onValor={(valor) => {
                  setCriticaTexto(valor);
                  aplicar(atencaoTexto, valor);
                }}
                inputMode="numeric"
                maxLength={3}
                endAdornment={
                  <InputAdornment position="end">
                    <PercentRoundedIcon fontSize="small" aria-hidden="true" />
                  </InputAdornment>
                }
              />
            </Campo>
          </Box>
          {erro ? (
            <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
          ) : null}
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { sm: "repeat(3, 1fr)" } }}>
            <Box
              sx={(tema) => ({
                ...CAIXA_FAIXA,
                color: tema.vars.palette.primary.main,
                backgroundColor: `color-mix(in srgb, ${tema.vars.palette.primary.main} 10%, transparent)`,
              })}
            >
              <Typography
                variant="subtitle2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <CheckCircleRoundedIcon fontSize="small" aria-hidden="true" /> Dentro do esperado
              </Typography>
              <Typography variant="body2">
                até {configuracoes.infrequenciaAtencaoPercentual}%
              </Typography>
            </Box>
            <Box
              sx={(tema) => ({
                ...CAIXA_FAIXA,
                color: tema.vars.palette.alerta.main,
                backgroundColor: `color-mix(in srgb, ${tema.vars.palette.alerta.main} 12%, transparent)`,
              })}
            >
              <Typography
                variant="subtitle2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <WarningAmberRoundedIcon fontSize="small" aria-hidden="true" /> Atenção
              </Typography>
              <Typography variant="body2">
                acima de {configuracoes.infrequenciaAtencaoPercentual}% até{" "}
                {configuracoes.infrequenciaCriticaPercentual}%
              </Typography>
            </Box>
            <Box
              sx={(tema) => ({
                ...CAIXA_FAIXA,
                color: tema.vars.palette.falta.main,
                backgroundColor: `color-mix(in srgb, ${tema.vars.palette.falta.main} 10%, transparent)`,
              })}
            >
              <Typography
                variant="subtitle2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <ErrorOutlineRoundedIcon fontSize="small" aria-hidden="true" /> Acima do limite
              </Typography>
              <Typography variant="body2">
                acima de {configuracoes.infrequenciaCriticaPercentual}%
              </Typography>
            </Box>
          </Box>
          <Acordeao
            titulo="Como ler as faixas"
            nivelTitulo="h4"
            resumo={
              <Typography
                component="span"
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />
                Os limites valem de segunda a sábado
              </Typography>
            }
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Os percentuais representam faltas nos dias de segunda a sábado. O primeiro limite deve
              ser menor que o segundo.
            </Typography>
          </Acordeao>
        </Stack>
      </Acordeao>
    </Box>
  );
}
