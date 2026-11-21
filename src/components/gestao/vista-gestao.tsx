"use client";

// Gestão: área do administrador. Séries, turmas, alunos, equipe, diretores
// de turma e configurações em abas curtas.
import { useEffect, useState, type KeyboardEvent } from "react";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ListAltRoundedIcon from "@mui/icons-material/ListAltRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import Box from "@mui/material/Box";
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

const ORDEM_ABAS: readonly Aba[] = [
  "series",
  "turmas",
  "alunos",
  "equipe",
  "diretores",
  "configuracoes",
];

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

  // As setas trocam a aba selecionada, como no teclado das abas antigas.
  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    if (!(evento.target instanceof HTMLElement)) return;
    if (evento.target.getAttribute("role") !== "tab") return;
    const indice = ORDEM_ABAS.indexOf(aba);
    if (indice < 0) return;
    const passo = evento.key === "ArrowRight" ? 1 : -1;
    const proximo = ORDEM_ABAS[(indice + passo + ORDEM_ABAS.length) % ORDEM_ABAS.length];
    if (proximo) setAba(proximo);
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
    <Box component="section" aria-label="Gestão da escola" onKeyDown={aoTeclar} sx={{ pb: 3 }}>
      <Typography component="h1" sx={ESTILO_TITULO_OCULTO}>
        Gestão
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <AtualizadoDaVisao fuso={fuso} />
      </Box>

      <Abas<Aba>
        rotuloAcessivel="Áreas de gestão"
        ativo={aba}
        onChange={setAba}
        itens={itens}
        dataPager="gestao"
      />
    </Box>
  );
}
