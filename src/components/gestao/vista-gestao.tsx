"use client";

// Mantém os painéis de Gestão montados sob a seleção da gaveta.
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type {
  Aluno,
  Configuracoes,
  JustificativaConfigurada,
  LiberadorConfigurado,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { PaineisVisitados } from "@/components/gestao/paineis-visitados";
import {
  CADASTROS_GESTAO,
  type DestinoGestao,
  type DestinoConfiguracoes,
} from "@/components/gestao/destinos-gestao";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import AbaSeries from "@/components/gestao/abas/aba-series";
import AbaTurmas from "@/components/gestao/abas/aba-turmas";
import AbaAlunos from "@/components/gestao/abas/aba-alunos";
import AbaEquipe from "@/components/gestao/abas/aba-equipe";
import AbaDiretores from "@/components/gestao/abas/aba-diretores";
import AbaConfiguracoes from "@/components/gestao/abas/aba-configuracoes";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

interface Props {
  destino: DestinoGestao;
  destinoConfiguracoes: DestinoConfiguracoes;
  planilhaInicial?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  usuarioId: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  diaCorrente: string;
  fuso: string;
  onSeriesMudaram: () => Promise<void>;
  onTurmasMudaram: () => Promise<void>;
  onAlunosMudaram: () => Promise<void>;
  onConfiguracoesMudaram: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
  onLiberadoresMudaram: () => Promise<void>;
  onHorariosMudaram: () => Promise<void> | void;
  onPendenciaHorarios?: (pendente: boolean) => void;
  onPendenciaConfiguracoes?: (pendente: boolean) => void;
  onAbrirSaidas?: () => void;
  onAbrirParcial?: () => void;
}

export default function VistaGestao({
  destino,
  destinoConfiguracoes,
  planilhaInicial,
  usuarioId,
  series,
  turmas,
  alunos,
  configuracoes,
  justificativas,
  liberadores,
  diaCorrente,
  fuso,
  onSeriesMudaram,
  onTurmasMudaram,
  onAlunosMudaram,
  onConfiguracoesMudaram,
  onJustificativasMudaram,
  onLiberadoresMudaram,
  onHorariosMudaram,
  onPendenciaHorarios,
  onPendenciaConfiguracoes,
  onAbrirSaidas,
  onAbrirParcial,
}: Props) {
  const { avisarInfo } = useAvisosDaSessao();
  const [atualizacao, setAtualizacao] = useState(0);
  const [horariosPendentes, setHorariosPendentes] = useState(false);
  const [configPendente, setConfigPendente] = useState(false);
  useEffect(() => {
    onPendenciaHorarios?.(horariosPendentes);
  }, [horariosPendentes, onPendenciaHorarios]);

  useEffect(() => {
    onPendenciaConfiguracoes?.(configPendente);
  }, [configPendente, onPendenciaConfiguracoes]);

  useAtualizacaoTela("gestao", async () => {
    if (horariosPendentes || configPendente) {
      avisarInfo("Salve ou descarte as alterações antes de atualizar.");
      return;
    }
    await Promise.all([
      onTurmasMudaram(),
      onAlunosMudaram(),
      onJustificativasMudaram(),
      onLiberadoresMudaram(),
    ]);
    setAtualizacao((valor) => valor + 1);
  });

  const itens = [
    {
      valor: "series" as const,
      conteudo: <AbaSeries series={series} onMudanca={onSeriesMudaram} />,
    },
    {
      valor: "turmas" as const,
      conteudo: (
        <AbaTurmas
          series={series}
          turmas={turmas}
          onMudanca={onTurmasMudaram}
          onOrdenacao={onAlunosMudaram}
        />
      ),
    },
    {
      valor: "alunos" as const,
      conteudo: <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={onAlunosMudaram} />,
    },
    {
      valor: "equipe" as const,
      conteudo: (
        <AbaEquipe usuarioId={usuarioId} onMudanca={onTurmasMudaram} atualizacao={atualizacao} />
      ),
    },
    {
      valor: "diretores" as const,
      conteudo: (
        <AbaDiretores turmas={turmas} diaCorrente={diaCorrente} atualizacao={atualizacao} />
      ),
    },
    {
      valor: "configuracoes" as const,
      conteudo: (
        <AbaConfiguracoes
          destino={destinoConfiguracoes}
          planilhaInicial={planilhaInicial}
          configuracoes={configuracoes}
          series={series}
          justificativas={justificativas}
          liberadores={liberadores}
          turmas={turmas}
          diaCorrente={diaCorrente}
          fuso={fuso}
          atualizacao={atualizacao}
          onMudanca={onConfiguracoesMudaram}
          onJustificativasMudaram={onJustificativasMudaram}
          onLiberadoresMudaram={onLiberadoresMudaram}
          onHorariosMudaram={onHorariosMudaram}
          onPendenciaHorarios={setHorariosPendentes}
          onPendenciaConfiguracoes={setConfigPendente}
          onAbrirSaidas={onAbrirSaidas}
          onAbrirParcial={onAbrirParcial}
        />
      ),
    },
  ];

  return (
    <Box component="section" aria-label="Gestão da escola" sx={{ pb: 3 }}>
      <Stack
        component="header"
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between", mb: 2 }}
      >
        <Typography component="h1" variant="h4" tabIndex={-1} data-titulo-gestao="">
          {destino === "configuracoes" ? "Configurações" : CADASTROS_GESTAO[destino]}
        </Typography>
        <AtualizadoDaVisao fuso={fuso} />
      </Stack>
      <PaineisVisitados ativo={destino} itens={itens} />
    </Box>
  );
}
