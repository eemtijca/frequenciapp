"use client";

// Gestão: área do administrador. Séries, turmas, alunos, equipe, diretores
// de turma e configurações em abas curtas.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ListAltRoundedIcon from "@mui/icons-material/ListAltRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
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
import { Abas, type ItemAba } from "@/components/ui/mui/abas";
import { Botao } from "@/components/ui/mui/botao";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import AbaSeries from "@/components/gestao/abas/aba-series";
import AbaTurmas from "@/components/gestao/abas/aba-turmas";
import AbaAlunos from "@/components/gestao/abas/aba-alunos";
import AbaEquipe from "@/components/gestao/abas/aba-equipe";
import AbaDiretores from "@/components/gestao/abas/aba-diretores";
import AbaConfiguracoes from "@/components/gestao/abas/aba-configuracoes";
import { avisarInfo } from "@/lib/avisos";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

export type Aba = "series" | "turmas" | "alunos" | "equipe" | "diretores" | "configuracoes";

interface Props {
  abaInicial?: Aba;
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

const ESTILO_TITULO_OCULTO = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export default function VistaGestao({
  abaInicial = "series",
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
  const [atualizacao, setAtualizacao] = useState(0);
  const [horariosPendentes, setHorariosPendentes] = useState(false);
  const [configPendente, setConfigPendente] = useState(false);
  const [aba, setAba] = useState<Aba>(() =>
    planilhaInicial ? "configuracoes" : (abaInicial ?? "series"),
  );
  const estaEmConfiguracoes = aba === "configuracoes";
  const cadastroAnterior = useRef<Aba>(abaInicial === "configuracoes" ? "series" : abaInicial);
  const gatilhoConfiguracoes = useRef<HTMLButtonElement>(null);
  const tituloConfiguracoes = useRef<HTMLHeadingElement>(null);
  const destinoFoco = useRef<"titulo" | "gatilho" | null>(null);

  useLayoutEffect(() => {
    if (destinoFoco.current === "titulo") tituloConfiguracoes.current?.focus();
    if (destinoFoco.current === "gatilho") gatilhoConfiguracoes.current?.focus();
    destinoFoco.current = null;
  }, [estaEmConfiguracoes]);

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

  function trocarAba(proxima: Aba) {
    if (proxima === "configuracoes" && aba !== "configuracoes") {
      cadastroAnterior.current = aba;
      destinoFoco.current = "titulo";
    }
    setAba(proxima);
  }

  function voltarParaGestao() {
    destinoFoco.current = "gatilho";
    setAba(cadastroAnterior.current);
  }

  const itens: ItemAba<Aba>[] = [
    {
      valor: "series",
      rotulo: "Séries",
      icone: <SchoolRoundedIcon fontSize="small" aria-hidden="true" />,
      conteudo: <AbaSeries series={series} onMudanca={onSeriesMudaram} />,
    },
    {
      valor: "turmas",
      rotulo: "Turmas",
      icone: <GroupsRoundedIcon fontSize="small" aria-hidden="true" />,
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
      valor: "alunos",
      rotulo: "Alunos",
      icone: <ListAltRoundedIcon fontSize="small" aria-hidden="true" />,
      conteudo: <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={onAlunosMudaram} />,
    },
    {
      valor: "equipe",
      rotulo: "Equipe",
      icone: <BadgeRoundedIcon fontSize="small" aria-hidden="true" />,
      conteudo: (
        <AbaEquipe usuarioId={usuarioId} onMudanca={onTurmasMudaram} atualizacao={atualizacao} />
      ),
    },
    {
      valor: "diretores",
      rotulo: "Diretores",
      icone: <AdminPanelSettingsRoundedIcon fontSize="small" aria-hidden="true" />,
      conteudo: (
        <AbaDiretores turmas={turmas} diaCorrente={diaCorrente} atualizacao={atualizacao} />
      ),
    },
    {
      valor: "configuracoes",
      rotulo: "Configurações",
      rotuloCurto: "Config.",
      referencia: gatilhoConfiguracoes,
      icone: <SettingsRoundedIcon fontSize="small" aria-hidden="true" />,
      conteudo: (
        <AbaConfiguracoes
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
      {estaEmConfiguracoes ? (
        <Stack component="header" spacing={1} sx={{ mb: 3 }}>
          <Botao
            type="button"
            variante="texto"
            onClick={voltarParaGestao}
            icone={<ArrowBackRoundedIcon />}
            sx={{ alignSelf: "flex-start", minHeight: 48 }}
          >
            Voltar para Gestão
          </Botao>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ justifyContent: "space-between" }}
          >
            <Typography component="h1" variant="h4" ref={tituloConfiguracoes} tabIndex={-1}>
              Configurações
            </Typography>
            <AtualizadoDaVisao fuso={fuso} />
          </Stack>
        </Stack>
      ) : (
        <>
          <Typography component="h1" sx={ESTILO_TITULO_OCULTO}>
            Gestão
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            <AtualizadoDaVisao fuso={fuso} />
          </Box>
        </>
      )}

      <Abas<Aba>
        rotuloAcessivel="Áreas de gestão"
        ativo={aba}
        onChange={trocarAba}
        itens={itens}
        dataPager="gestao"
        ocultarTrilho={estaEmConfiguracoes}
      />
    </Box>
  );
}
