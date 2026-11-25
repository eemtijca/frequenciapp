"use client";

// Chamada diária: presença por padrão, falta ao tocar e justificativa (FJ), com rascunho local.
// O dia aberto, o conflito por revisão e o bloqueio após salvar são preservados.
import {
  mesmasJustificativasAntecipadas,
  type JustificativaAntecipada,
  type RevisaoJustificativaAntecipada,
} from "@/domain/justificativas-antecipadas";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import Grid from "@mui/material/Grid";
import Grow from "@mui/material/Grow";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import { snackbarClasses } from "@mui/material/Snackbar";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";
import { publicarAviso } from "@/components/ui/mui/avisos";
import { avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { chaveRascunho } from "@/lib/rascunho-chamada";
import { ouvirBeneficiosMudaram } from "@/lib/eventos-beneficios";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import type {
  AcumuladoAluno,
  Aluno,
  Configuracoes,
  Frequencia,
  JustificativaConfigurada,
  ResumoAcumulado,
  Turma,
} from "@/domain/frequencia";
import {
  alunoDesistenteNoDia,
  dataNoFuso,
  diaDaSemanaIso,
  diasDoMes,
  exibirOrigemNaChamada,
  horaNoFuso,
  horariosDaChamada,
  JUSTIFICATIVA_OUTROS,
  nomeNaChamada,
  rotuloDiaSemana,
  rotuloJustificativa,
  type FaltaAluno,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { temCapacidade, type Identidade } from "@/domain/usuarios";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { AlertaCompacto, TelaEstado, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { CirculosAcumulado, fraseAcumulado } from "@/components/ui/mui/circulo-contagem";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Selo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { ESPACAMENTO_LATERAL_CONTEUDO, LayoutConteudo } from "@/components/layout/layout-conteudo";
import { VistaResumoSemana } from "@/components/chamada/resumo-semana";
import { SeletorTurmaChamada } from "@/components/chamada/seletor-turma-chamada";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";
import { AvisoBeneficioFrequencia } from "@/components/chamada/aviso-beneficio-frequencia";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";
import { TOKENS_LAYOUT } from "@/theme/layout";

type Filtro = "todos" | "faltas" | "justificadas" | "presentes";

interface Props {
  usuario: Identidade;
  ativo: boolean;
  turmas: Turma[];
  alunos: Aluno[];
  diaCorrente: string;
  fuso: string;
  alvo: { dia: string; turmaId: string } | null;
  configuracoes: Configuracoes;
  catalogoJustificativas: JustificativaConfigurada[];
  versaoFrequencias: number;
  onFrequenciasMudaram: (mes: string) => Promise<void>;
  onPendencia: (visoes: "chamada"[]) => void;
  onAbrirGestao?: () => void;
}

interface Rascunho {
  versao: 3;
  faltas: FaltaAluno[];
  revisao: number;
  sabadoLetivo?: boolean;
  justificativasAntecipadas?: RevisaoJustificativaAntecipada[];
}

/** Converte as faltas agrupadas do servidor em mapa por aluno. */
function paraAusencias(faltas: FaltaAluno[]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const falta of faltas) {
    mapa.set(falta.alunoId, new Set(falta.horarios));
  }
  return mapa;
}

function paraJustificativas(faltas: FaltaAluno[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const falta of faltas) {
    if (falta.justificativa) mapa.set(falta.alunoId, falta.justificativa);
  }
  return mapa;
}

function paraObservacoes(faltas: FaltaAluno[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const falta of faltas) {
    if (falta.observacao) mapa.set(falta.alunoId, falta.observacao);
  }
  return mapa;
}

const VISUALMENTE_OCULTO = {
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

function estilosMarca(theme: Theme, estado: "P" | "F" | "FJ" | "D") {
  const palette = theme.vars.palette;
  const base = {
    display: "flex",
    minHeight: 32,
    minWidth: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 0.5,
    borderRadius: 2,
    paddingX: 1,
    fontSize: "0.875rem",
    fontWeight: 600,
    pointerEvents: "none" as const,
  };

  if (estado === "F" || estado === "FJ") {
    const cor = estado === "F" ? palette.falta : palette.justificada;
    return {
      ...base,
      backgroundColor: cor.main,
      color: cor.contrastText,
    };
  }
  if (estado === "D") {
    return { ...base, backgroundColor: palette.action.hover, color: palette.text.secondary };
  }
  return { ...base, color: palette.text.secondary };
}

function BarraSalvamento({ children, ref }: { children: ReactNode; ref: Ref<HTMLElement> }) {
  return (
    <Paper
      component="footer"
      ref={ref}
      aria-label="Barra de salvamento"
      elevation={0}
      sx={(theme) => ({
        position: { xs: "sticky", xl: "static" },
        bottom: { xs: 0, xl: "auto" },
        zIndex: theme.zIndex.appBar,
        display: "flex",
        alignItems: "center",
        gap: 1,
        paddingTop: 0.5,
        paddingLeft: "calc(8px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(8px + env(safe-area-inset-right, 0px))",
        paddingBottom: "calc(4px + env(safe-area-inset-bottom, 0px))",
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
      })}
    >
      {children}
    </Paper>
  );
}

export default function VistaFrequencia({
  usuario,
  ativo,
  turmas,
  alunos,
  diaCorrente,
  fuso,
  alvo,
  configuracoes,
  catalogoJustificativas,
  versaoFrequencias,
  onFrequenciasMudaram,
  onPendencia,
  onAbrirGestao,
}: Props) {
  const podeAdministrar = temCapacidade(usuario.papel, "administrar");
  const temTurmas = turmas.length > 0;
  const [turmaId, setTurmaId] = useState(() => alvo?.turmaId ?? turmas[0]?.id ?? "");
  // No domingo, a abertura é o resumo da semana encerrada. Um atalho de
  // histórico continua abrindo o dia pedido, nunca o resumo.
  const nav = useNavegacaoDoDia({
    diaCorrente,
    max: diaCorrente,
    diaInicial: alvo?.dia ?? null,
    domingoComoResumo: true,
  });
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const dia = nav.dia;
  const [ausencias, setAusencias] = useState<Map<string, Set<string>>>(new Map());
  const [justificativas, setJustificativas] = useState<Map<string, string>>(new Map());
  const [observacoes, setObservacoes] = useState<Map<string, string>>(new Map());
  const [aulasAbertas, setAulasAbertas] = useState<string | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [sabadoDesbloqueado, setSabadoDesbloqueado] = useState<string | null>(null);
  const idResumo = useId();
  const listaAlunosRef = useRef<HTMLUListElement>(null);
  const gradeDiariaRef = useRef<HTMLDivElement>(null);
  const colunaAlunosRef = useRef<HTMLDivElement>(null);
  const barraSalvamentoRef = useRef<HTMLElement>(null);
  const focoDaBarraRef = useRef<string | null>(null);
  const gatilhoDaRevisaoRef = useRef<HTMLButtonElement | null>(null);
  const gatilhoDoDescarteRef = useRef<HTMLButtonElement | null>(null);
  const [revisaoSalva, setRevisaoSalva] = useState(0);
  const [edicaoLiberada, setEdicaoLiberada] = useState(false);
  // Lista gravada da chamada; nula enquanto o dia não foi salvo.
  const [listaGravada, setListaGravada] = useState<string[] | null>(null);
  const [frequenciasDoDia, setFrequenciasDoDia] = useState<{
    chave: string;
    frequencias: Frequencia[];
    feriado?: Feriado | null;
    nomeFeriadoNoCadastro: string;
  } | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [carregando, setCarregando] = useState(() => !nav.resumo);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [conflito, setConflito] = useState(false);
  const [confirmarSalvamento, setConfirmarSalvamento] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);
  const [desbloqueio, setDesbloqueio] = useState<"chamada" | "sabado" | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const justificativasAntecipadasRef = useRef<RevisaoJustificativaAntecipada[]>([]);
  const [recarregar, setRecarregar] = useState(0);
  const chaveCarregada = useRef("");
  const falhaRascunho = useRef("");
  const confirmacaoHistoricaRef = useRef<{ confirmar: boolean; motivo: string }>({
    confirmar: false,
    motivo: "",
  });
  const [confirmacaoHistoricaAberta, setConfirmacaoHistoricaAberta] = useState(false);
  const [motivoHistorico, setMotivoHistorico] = useState("");
  const [erroHistorico, setErroHistorico] = useState("");
  const semMovimento = !useAnimacoesDaInterface().animacoesAtivas;
  const painelLateral = useMediaQuery((tema: Theme) => tema.breakpoints.up("xl"));

  const restaurarFocoDaBarra = useCallback((acao: string | null | undefined) => {
    if (acao !== "salvar" && acao !== "descartar") return;
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      barraSalvamentoRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-acao-barra="${acao}"]:not(:disabled)`)
        ?.focus({ preventScroll: true });
    });
  }, []);

  const registrarBarraSalvamento = useCallback(
    (barra: HTMLElement | null) => {
      if (!barra) {
        const foco = document.activeElement;
        focoDaBarraRef.current =
          foco instanceof HTMLButtonElement && barraSalvamentoRef.current?.contains(foco)
            ? (foco.dataset.acaoBarra ?? null)
            : null;
      }
      barraSalvamentoRef.current = barra;
      if (barra) {
        restaurarFocoDaBarra(focoDaBarraRef.current);
        focoDaBarraRef.current = null;
      }
    },
    [restaurarFocoDaBarra],
  );

  function restaurarGatilhoSeMoveu(gatilho: HTMLButtonElement | null) {
    // No mesmo layout, o diálogo do MUI já devolve o foco ao botão original.
    if (gatilho && !gatilho.isConnected) restaurarFocoDaBarra(gatilho.dataset.acaoBarra);
  }

  useEffect(() => {
    if (!ativo || nav.resumo || !temTurmas) return;
    const grade = gradeDiariaRef.current;
    const coluna = colunaAlunosRef.current;
    const barra = barraSalvamentoRef.current;
    const rolagem = grade?.closest<HTMLElement>('[data-pager="principal"] > section');
    if (!grade || !coluna || !barra || !rolagem) return;

    let quadro = 0;
    let aviso: HTMLElement | null = null;
    const folga = 8;
    const reserva = "--reserva-aviso-chamada";
    const cruzaNaHorizontal = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right;

    const medir = () => {
      quadro = 0;
      const limites = rolagem.getBoundingClientRect();
      const rodape = barra.getBoundingClientRect();
      const sobreposicao = aviso?.getBoundingClientRect();
      const caixaColuna = coluna.getBoundingClientRect();
      // A barra só reduz a altura disponível na coluna que ela cruza.
      const alturaSobreALista = cruzaNaHorizontal(caixaColuna, rodape) ? rodape.height : 0;
      const espaco =
        sobreposicao?.height && cruzaNaHorizontal(caixaColuna, sobreposicao)
          ? Math.max(0, limites.bottom - alturaSobreALista - sobreposicao.top + folga)
          : 0;
      grade.style.setProperty(reserva, `${espaco}px`);

      const foco = document.activeElement;
      if (
        !(foco instanceof HTMLElement) ||
        !grade.contains(foco) ||
        barra.contains(foco) ||
        !foco.matches(":focus-visible")
      ) {
        return;
      }
      const controle = foco.matches("[data-marcar-falta]")
        ? (foco.closest("[data-faixa-toque]") ?? foco)
        : foco;
      const caixaBarra = barra.getBoundingClientRect();
      const limiteInferior = (caixa: DOMRect) => {
        const topo = cruzaNaHorizontal(caixa, caixaBarra) ? caixaBarra.top : limites.bottom;
        return sobreposicao?.height && cruzaNaHorizontal(caixa, sobreposicao)
          ? Math.min(topo, sobreposicao.top)
          : topo;
      };
      const linha = foco.closest("li");
      const caixaLinha =
        linha && listaAlunosRef.current?.contains(linha) ? linha.getBoundingClientRect() : null;
      // Quando cabe, preserve a linha inteira, inclusive justificativa e aulas.
      // Uma linha maior que a área livre não deve deslocar o foco para fora dela.
      const caixa =
        caixaLinha && caixaLinha.height + folga <= limiteInferior(caixaLinha) - limites.top
          ? caixaLinha
          : controle.getBoundingClientRect();
      const topo = limiteInferior(caixa);
      if (caixa.top < limites.bottom && caixa.top > limites.top && caixa.bottom + folga > topo) {
        // Mova só o necessário, sem trocar o elemento focado.
        rolagem.scrollTop += Math.min(caixa.bottom + folga - topo, caixa.top - limites.top);
      }
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    const tamanhos = new ResizeObserver(agendar);
    const acompanharAviso = () => {
      // O aviso global é filho do body; só a Chamada em uso reserva espaço para ele.
      const atual = document.body.querySelector<HTMLElement>(`:scope > .${snackbarClasses.root}`);
      if (aviso !== atual) {
        if (aviso) tamanhos.unobserve(aviso);
        aviso = atual;
        if (aviso) tamanhos.observe(aviso);
      }
      agendar();
    };
    const montagem = new MutationObserver(acompanharAviso);
    montagem.observe(document.body, { childList: true });
    tamanhos.observe(rolagem);
    tamanhos.observe(barra);
    tamanhos.observe(coluna);
    grade.addEventListener("focusin", agendar);
    window.addEventListener("resize", agendar);
    acompanharAviso();
    return () => {
      montagem.disconnect();
      tamanhos.disconnect();
      grade.removeEventListener("focusin", agendar);
      window.removeEventListener("resize", agendar);
      cancelAnimationFrame(quadro);
      grade.style.removeProperty(reserva);
    };
  }, [ativo, nav.resumo, temTurmas, painelLateral]);

  const atualizarTela = useCallback(() => {
    if (sujo) {
      publicarAviso({
        id: "chamada-atualizar-sujo",
        severidade: "info",
        titulo: "Salve ou descarte as alterações antes de atualizar.",
      });
      return;
    }
    setRecarregar((valor) => valor + 1);
  }, [sujo]);
  const marcarChamadaAtualizada = useAtualizacaoTela("chamada", atualizarTela);

  // Sincroniza quando o histórico pede para abrir uma frequência específica.
  // A prop é comparada durante o render, como o React recomenda para estado
  // derivado, em vez de um efeito que marca o estado depois da pintura.
  const [alvoAnterior, setAlvoAnterior] = useState(alvo);
  if (alvo !== alvoAnterior) {
    setAlvoAnterior(alvo);
    if (alvo) {
      setTurmaId(alvo.turmaId);
      setCarregando(true);
      nav.escolherDia(ultimoDiaDeChamada(alvo.dia));
    }
  }

  // Seleciona a primeira turma quando nada foi escolhido ainda.
  const primeiraTurma = turmas[0];
  if (turmaId === "" && primeiraTurma !== undefined) setTurmaId(primeiraTurma.id);

  const turma = turmas.find((t) => t.id === turmaId);
  const turmasDoResumo = useMemo(() => (turma ? [turma] : []), [turma]);
  const chave = `${dia}|${turmaId}`;
  const ehSabado = diaDaSemanaIso(dia) === 6;
  const leituraConfirmada = frequenciasDoDia?.chave === chave;
  const feriadoCadastrado = feriadoNaData(configuracoes.feriados, dia);
  const nomeFeriadoNoCadastro = feriadoCadastrado?.nome ?? "";
  const feriado =
    leituraConfirmada &&
    frequenciasDoDia.nomeFeriadoNoCadastro === nomeFeriadoNoCadastro &&
    frequenciasDoDia.feriado !== undefined
      ? frequenciasDoDia.feriado
      : feriadoCadastrado;
  const temAulasAtivas = turma?.horarios.some((aula) => aula.ativo) ?? false;
  // Todo sábado começa bloqueado, mesmo com aula na grade: só o botão libera.
  // Uma chamada já salva ou um rascunho recuperado mantêm a liberação.
  const sabadoLiberado =
    ehSabado &&
    leituraConfirmada &&
    (sabadoDesbloqueado === chave ||
      frequenciasDoDia.frequencias.some((item) => item.turmaId === turmaId));

  // Carrega as chamadas do dia, seleciona a turma e recupera o rascunho local.
  // O reinício do estado e o aviso de carregando vêm antes da busca: nenhuma
  // marca do dia anterior pode aparecer enquanto a chamada nova não chega.
  // A regra set-state-in-effect não distingue esse caso, registrado no ADR 047.
  /* eslint-disable react-hooks/set-state-in-effect -- reinício do estado antes da busca da chamada (ADR 047) */
  useEffect(() => {
    if (nav.resumo) return;
    if (!dia || !turmaId) {
      setCarregando(false);
      setErro("");
      setConflito(false);
      return;
    }
    let viva = true;
    setCarregando(true);
    setSabadoDesbloqueado(null);
    setFrequenciasDoDia(null);
    setErro("");
    setConflito(false);
    setSujo(false);
    setFiltro("todos");
    setAusencias(new Map());
    setJustificativas(new Map());
    setObservacoes(new Map());
    setAulasAbertas(null);
    setResumoAberto(false);
    setRevisaoSalva(0);
    setEdicaoLiberada(false);
    setListaGravada(null);
    setAtualizadoEm("");
    chaveCarregada.current = chave;

    pedir<{
      frequencias: Frequencia[];
      feriado?: Feriado | null;
      justificativasAntecipadas?: JustificativaAntecipada[];
    }>(`/api/frequencias?dia=${dia}`)
      .then((dados) => {
        if (!viva) return;
        const frequencias = dados.frequencias.filter((item) => item.dia === dia);
        const frequencia = frequencias.find((item) => item.turmaId === turmaId) ?? null;
        setFrequenciasDoDia({ chave, frequencias, feriado: dados.feriado, nomeFeriadoNoCadastro });
        marcarChamadaAtualizada();
        const agendadas = frequencia
          ? []
          : (dados.justificativasAntecipadas ?? []).filter((j) => j.turmaId === turmaId);
        justificativasAntecipadasRef.current = agendadas.map(({ id, revisao }) => ({
          id,
          revisao,
        }));
        const propostas = agendadas.map((j) => ({
          alunoId: j.alunoId,
          horarios: turma ? horariosDaChamada(turma.horarios, dia, true).map((h) => h.id) : [],
          justificativa: j.justificativa,
          observacao: j.observacao ?? undefined,
        }));
        const faltasIniciais = frequencia?.faltas ?? propostas;
        setAusencias(paraAusencias(faltasIniciais));
        setJustificativas(paraJustificativas(faltasIniciais));
        setObservacoes(paraObservacoes(faltasIniciais));
        setRevisaoSalva(frequencia?.revisao ?? 0);
        setListaGravada(frequencia?.alunos ?? null);
        setAtualizadoEm(frequencia?.atualizadoEm ?? "");

        try {
          const bruto = sessionStorage.getItem(chaveRascunho(usuario.id, dia, turmaId));
          if (bruto) {
            let rascunho: Rascunho;
            try {
              rascunho = JSON.parse(bruto) as Rascunho;
            } catch {
              // Apenas conteúdo comprovadamente inválido pode ser descartado.
              sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
              publicarAviso({
                id: "chamada-rascunho-ilegivel",
                severidade: "error",
                titulo: "O rascunho local estava ilegível e não foi recuperado.",
              });
              return;
            }
            if (!rascunho || rascunho.versao !== 3 || !Array.isArray(rascunho.faltas)) {
              sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
            } else {
              setAusencias(paraAusencias(rascunho.faltas));
              setJustificativas(paraJustificativas(rascunho.faltas));
              setObservacoes(paraObservacoes(rascunho.faltas));
              if (rascunho.sabadoLetivo && diaDaSemanaIso(dia) === 6) setSabadoDesbloqueado(chave);
              const agendasIguais =
                frequencia ||
                mesmasJustificativasAntecipadas(
                  rascunho.justificativasAntecipadas ?? [],
                  justificativasAntecipadasRef.current,
                );
              justificativasAntecipadasRef.current = rascunho.justificativasAntecipadas ?? [];
              setSujo(true);
              if (rascunho.revisao === (frequencia?.revisao ?? 0) && agendasIguais) {
                publicarAviso({
                  id: "chamada-rascunho-recuperado",
                  severidade: "info",
                  titulo: frequencia
                    ? "Rascunho recuperado. Desbloqueie a chamada, confira e salve."
                    : "Rascunho recuperado. Confira as faltas e salve a frequência.",
                });
              } else {
                setConflito(true);
                setErro(
                  agendasIguais
                    ? "Há um rascunho neste dispositivo e uma versão mais nova salva. Confira antes de recarregar."
                    : "As justificativas antecipadas mudaram desde o rascunho. Recarregue a chamada e confira as marcações.",
                );
              }
            }
          }
        } catch {
          publicarAviso({
            id: "chamada-rascunho-leitura",
            severidade: "error",
            titulo:
              "Não foi possível ler ou remover o rascunho local. A chamada continua disponível; a cópia anterior não foi descartada automaticamente.",
          });
        }
      })
      .catch((excecao: unknown) => {
        if (!viva) return;
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar a frequência.",
        );
        setErroVariante(estadoDeErro(excecao));
      })
      .finally(() => {
        if (viva) setCarregando(false);
      });

    return () => {
      viva = false;
    };
  }, [
    chave,
    recarregar,
    usuario.id,
    dia,
    turmaId,
    turma,
    nomeFeriadoNoCadastro,
    nav.resumo,
    marcarChamadaAtualizada,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Grava rascunho enquanto houver marcação não salva.
  useEffect(() => {
    if (!sujo || !dia || !turmaId) return;
    try {
      const rascunho: Rascunho = {
        versao: 3,
        justificativasAntecipadas: justificativasAntecipadasRef.current,
        faltas: [...ausencias.entries()].map(([alunoId, horarios]) => ({
          alunoId,
          horarios: [...horarios],
          justificativa: justificativas.get(alunoId) ?? null,
          observacao: observacoes.get(alunoId) ?? null,
        })),
        revisao: revisaoSalva,
        ...(sabadoLiberado ? { sabadoLetivo: true } : {}),
      };
      sessionStorage.setItem(chaveRascunho(usuario.id, dia, turmaId), JSON.stringify(rascunho));
      falhaRascunho.current = "";
    } catch {
      const chave = chaveRascunho(usuario.id, dia, turmaId);
      if (falhaRascunho.current !== chave) {
        falhaRascunho.current = chave;
        publicarAviso({
          id: "chamada-rascunho-gravacao",
          severidade: "error",
          titulo:
            "As alterações mais recentes estão apenas nesta aba. Não foi possível atualizar o rascunho local; uma cópia anterior pode continuar disponível.",
        });
      }
    }
  }, [
    sujo,
    ausencias,
    justificativas,
    observacoes,
    revisaoSalva,
    usuario.id,
    dia,
    turmaId,
    sabadoLiberado,
  ]);

  useEffect(() => {
    onPendencia(sujo ? ["chamada"] : []);
  }, [sujo, onPendencia]);

  // Dia novo: a relação atual da turma. Dia salvo: quem estava na chamada,
  // mesmo que tenha mudado de turma depois; hoje também recebe quem entrou.
  const ativosDaTurma = useMemo(() => {
    const daTurma = (aluno: Aluno) => aluno.ativo && aluno.turmaId === turmaId;
    const naLista = new Set(listaGravada ?? []);
    return alunos
      .filter((aluno) =>
        listaGravada === null
          ? daTurma(aluno)
          : naLista.has(aluno.id) || (dia === diaCorrente && daTurma(aluno)),
      )
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [alunos, turmaId, listaGravada, dia, diaCorrente]);
  const desistentesDaTurma = useMemo(
    () =>
      new Set(
        ativosDaTurma.filter((aluno) => alunoDesistenteNoDia(aluno, dia)).map((aluno) => aluno.id),
      ),
    [ativosDaTurma, dia],
  );
  const participantes = useMemo(
    () => ativosDaTurma.filter((aluno) => !desistentesDaTurma.has(aluno.id)),
    [ativosDaTurma, desistentesDaTurma],
  );

  const mostrarOrigem = exibirOrigemNaChamada(configuracoes, turma);

  const aulasDoDia = useMemo(
    () => (turma ? horariosDaChamada(turma.horarios, dia, sabadoLiberado) : []),
    [turma, dia, sabadoLiberado],
  );
  // Retrato congelado da chamada salva: o denominador de aulas do dia e das
  // faltas parciais não muda quando a grade muda depois do registro.
  const aulasRegistradas = useMemo(() => {
    const frequencia = leituraConfirmada
      ? frequenciasDoDia?.frequencias.find((item) => item.turmaId === turmaId)
      : null;
    return frequencia?.aulas && frequencia.aulas.length > 0 ? frequencia.aulas : null;
  }, [leituraConfirmada, frequenciasDoDia, turmaId]);
  const totalAulasDoDia = aulasRegistradas?.length ?? aulasDoDia.length;
  const mesDaChamada = dia.slice(0, 7);
  const chaveResumo = `${mesDaChamada}|${versaoFrequencias}|${recarregar}`;
  const [cargaResumo, setCargaResumo] = useState<{
    chave: string;
    resumo: ResumoAcumulado | null;
  } | null>(null);
  const resumo = cargaResumo?.chave === chaveResumo ? cargaResumo.resumo : null;
  useEffect(() => {
    let atual = true;
    const dias = diasDoMes(mesDaChamada);
    const ate = dias[dias.length - 1];
    if (!ate) return;
    pedir<{ resumo: ResumoAcumulado }>(`/api/frequencias/resumo?de=${mesDaChamada}-01&ate=${ate}`)
      .then((dados) => {
        if (atual) setCargaResumo({ chave: chaveResumo, resumo: dados.resumo });
      })
      .catch(() => {
        if (atual) setCargaResumo({ chave: chaveResumo, resumo: null });
      });
    return () => {
      atual = false;
    };
  }, [mesDaChamada, chaveResumo]);

  // Alunos com faltas do mês acima do limite de algum benefício; falha na leitura apenas omite o aviso.
  const [cargaAlertas, setCargaAlertas] = useState<{
    chave: string;
    alertas: AlertaFrequenciaBeneficio[];
  } | null>(null);
  // A Gestão avisa quando as regras dos benefícios mudam, pois esta tela continua montada.
  const [versaoBeneficios, setVersaoBeneficios] = useState(0);
  useEffect(() => ouvirBeneficiosMudaram(() => setVersaoBeneficios((versao) => versao + 1)), []);
  // Feriados importados e manuais compõem a mesma base mensal. Alterar outra
  // data fora do mês ou apenas o nome do feriado não exige uma nova consulta.
  const calendarioDoMes = configuracoes.feriados
    .filter((feriado) => feriado.dia.startsWith(`${mesDaChamada}-`))
    .map((feriado) => feriado.dia)
    .sort()
    .join(",");
  const chaveAlertas = `${chaveResumo}|${versaoBeneficios}|${calendarioDoMes}`;
  useEffect(() => {
    let atual = true;
    pedir<{ alertas: AlertaFrequenciaBeneficio[] }>(
      `/api/frequencias/alertas-beneficios?mes=${mesDaChamada}`,
    )
      .then((dados) => {
        if (atual) setCargaAlertas({ chave: chaveAlertas, alertas: dados.alertas });
      })
      .catch(() => {
        if (atual) setCargaAlertas({ chave: chaveAlertas, alertas: [] });
      });
    return () => {
      atual = false;
    };
  }, [mesDaChamada, chaveAlertas]);
  const alertasDoAluno = useMemo(() => {
    const mapa = new Map<string, AlertaFrequenciaBeneficio[]>();
    for (const alerta of cargaAlertas?.chave === chaveAlertas ? cargaAlertas.alertas : []) {
      mapa.set(alerta.alunoId, [...(mapa.get(alerta.alunoId) ?? []), alerta]);
    }
    return (alunoId: string): AlertaFrequenciaBeneficio[] => mapa.get(alunoId) ?? [];
  }, [cargaAlertas, chaveAlertas]);

  const acumuladoDe = useMemo(() => {
    const mapa = new Map((resumo?.porAluno ?? []).map((item) => [item.alunoId, item]));
    return (alunoId: string): AcumuladoAluno | null => mapa.get(alunoId) ?? null;
  }, [resumo]);

  const rotuloOrigemDe = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  const opcoesJustificativa = useMemo(
    () => [
      { valor: "", rotulo: "Sem justificativa" },
      ...catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: item.rotulo })),
    ],
    [catalogoJustificativas],
  );

  const { contagemFaltas, contagemJustificadas, contagemParciais } = useMemo(() => {
    let contagemFaltas = 0;
    let contagemJustificadas = 0;
    let contagemParciais = 0;
    for (const aluno of participantes) {
      if (ausencias.has(aluno.id)) contagemFaltas += 1;
      if (justificativas.has(aluno.id)) contagemJustificadas += 1;
      const marcadas = ausencias.get(aluno.id)?.size ?? 0;
      if (marcadas > 0 && totalAulasDoDia > 0 && marcadas < totalAulasDoDia) contagemParciais += 1;
    }
    return { contagemFaltas, contagemJustificadas, contagemParciais };
  }, [participantes, ausencias, justificativas, totalAulasDoDia]);
  const contagemPresencas = participantes.length - contagemFaltas;

  const visiveis = useMemo(
    () =>
      ativosDaTurma.filter(
        (aluno) =>
          filtro === "todos" ||
          (!desistentesDaTurma.has(aluno.id) &&
            ((filtro === "faltas" && ausencias.has(aluno.id)) ||
              (filtro === "justificadas" && justificativas.has(aluno.id)) ||
              (filtro === "presentes" && !ausencias.has(aluno.id)))),
      ),
    [ativosDaTurma, filtro, ausencias, justificativas, desistentesDaTurma],
  );

  const chamadaBloqueada = revisaoSalva > 0 && !edicaoLiberada;
  const ocupado = carregando || salvando || conflito;
  const bloqueado =
    ocupado ||
    !leituraConfirmada ||
    chamadaBloqueada ||
    Boolean(feriado) ||
    (ehSabado && !sabadoLiberado);
  const travado = ocupado || sujo;
  const podeSalvar = !bloqueado && (sujo || revisaoSalva === 0);
  const chamadaNaoIniciada = leituraConfirmada && revisaoSalva === 0 && !sujo;
  const mostrarSituacao =
    leituraConfirmada &&
    !carregando &&
    !erro &&
    !conflito &&
    !feriado &&
    (!ehSabado || sabadoLiberado) &&
    participantes.length > 0;
  const tituloSituacao = chamadaNaoIniciada
    ? "Chamada não iniciada"
    : sujo
      ? revisaoSalva === 0
        ? "Em andamento"
        : "Alterações não salvas"
      : "Chamada salva";

  function iniciarChamada() {
    if (!mostrarSituacao || !chamadaNaoIniciada || bloqueado || chaveCarregada.current !== chave)
      return;
    setFiltro("todos");
    // Um rascunho sem faltas também preserva o início da conferência dos alunos.
    setSujo(true);
    requestAnimationFrame(() => {
      listaAlunosRef.current
        ?.querySelector<HTMLButtonElement>("button[data-marcar-falta]:not(:disabled)")
        ?.focus();
    });
  }

  const alternarFalta = useCallback(
    (alunoId: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setAusencias((atuais) => {
        const proximas = new Map(atuais);
        if (proximas.has(alunoId)) {
          proximas.delete(alunoId);
        } else {
          proximas.set(alunoId, new Set(aulasDoDia.map((aula) => aula.id)));
        }
        return proximas;
      });
      if (ausencias.has(alunoId)) {
        setJustificativas((atuais) => {
          if (!atuais.has(alunoId)) return atuais;
          const proximas = new Map(atuais);
          proximas.delete(alunoId);
          return proximas;
        });
        setObservacoes((atuais) => {
          if (!atuais.has(alunoId)) return atuais;
          const proximas = new Map(atuais);
          proximas.delete(alunoId);
          return proximas;
        });
      }
      setSujo(true);
      setErro("");
    },
    [aulasDoDia, ausencias, bloqueado, chave, desistentesDaTurma],
  );

  const definirJustificativa = useCallback(
    (alunoId: string, codigo: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setJustificativas((atuais) => {
        const proximas = new Map(atuais);
        if (codigo === "") proximas.delete(alunoId);
        else proximas.set(alunoId, codigo);
        return proximas;
      });
      if (codigo !== JUSTIFICATIVA_OUTROS) {
        setObservacoes((atuais) => {
          if (!atuais.has(alunoId)) return atuais;
          const proximas = new Map(atuais);
          proximas.delete(alunoId);
          return proximas;
        });
      }
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave, desistentesDaTurma],
  );

  const definirObservacao = useCallback(
    (alunoId: string, texto: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setObservacoes((atuais) => {
        const proximas = new Map(atuais);
        if (texto === "") proximas.delete(alunoId);
        else proximas.set(alunoId, texto);
        return proximas;
      });
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave, desistentesDaTurma],
  );

  const alternarAula = useCallback(
    (alunoId: string, horarioId: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setAusencias((atuais) => {
        const proximas = new Map(atuais);
        const aulas = new Set(proximas.get(alunoId) ?? []);
        if (aulas.has(horarioId)) aulas.delete(horarioId);
        else aulas.add(horarioId);
        if (aulas.size === 0) proximas.delete(alunoId);
        else proximas.set(alunoId, aulas);
        return proximas;
      });
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave, desistentesDaTurma],
  );

  function definirAulas(alunoId: string, ids: string[]) {
    if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
    setAusencias((atuais) => {
      const proximas = new Map(atuais);
      if (ids.length === 0) proximas.delete(alunoId);
      else proximas.set(alunoId, new Set(ids));
      return proximas;
    });
    setSujo(true);
    setErro("");
  }

  const { executar: salvar } = useAcaoUnica(async () => {
    if (!podeSalvar || !dia || !turmaId) return;
    setSalvando(true);
    setErro("");
    try {
      const dados = await pedir<{ frequencia: Frequencia }>(
        "/api/frequencias",
        corpoJson({
          dia,
          turmaId,
          faltas: [...ausencias.entries()].map(([alunoId, horarios]) => ({
            alunoId,
            horarios: [...horarios],
            justificativa: justificativas.get(alunoId) ?? null,
            observacao:
              justificativas.get(alunoId) === JUSTIFICATIVA_OUTROS
                ? (observacoes.get(alunoId) ?? null)
                : null,
          })),
          revisao: revisaoSalva,
          justificativasAntecipadas: justificativasAntecipadasRef.current,
          ...(sabadoLiberado ? { sabadoLetivo: true } : {}),
          ...(confirmacaoHistoricaRef.current.confirmar
            ? {
                confirmarHistorico: true,
                motivo: confirmacaoHistoricaRef.current.motivo,
              }
            : {}),
        }),
      );
      setFrequenciasDoDia((atual) => {
        if (atual?.chave !== chave) return atual;
        return {
          ...atual,
          frequencias: [
            ...atual.frequencias.filter((item) => item.turmaId !== dados.frequencia.turmaId),
            dados.frequencia,
          ],
        };
      });
      setAusencias(paraAusencias(dados.frequencia.faltas));
      setJustificativas(paraJustificativas(dados.frequencia.faltas));
      setObservacoes(paraObservacoes(dados.frequencia.faltas));
      setAulasAbertas(null);
      setRevisaoSalva(dados.frequencia.revisao);
      setEdicaoLiberada(false);
      setListaGravada(dados.frequencia.alunos ?? null);
      setAtualizadoEm(dados.frequencia.atualizadoEm);
      setSujo(false);
      setConflito(false);
      confirmacaoHistoricaRef.current = { confirmar: false, motivo: "" };
      setMotivoHistorico("");
      setErroHistorico("");
      try {
        sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
      } catch {
        publicarAviso({
          id: "chamada-rascunho-salvo-remover",
          severidade: "error",
          titulo:
            "A frequência foi salva, mas não foi possível remover o rascunho deste navegador.",
        });
      }
      const total = dados.frequencia.faltas.length;
      const justificadas = dados.frequencia.faltas.filter((falta) => falta.justificativa).length;
      avisarSucesso(
        total === 0
          ? "Chamada salva. Todos presentes."
          : `Chamada salva com ${total} ${total === 1 ? "falta" : "faltas"}${
              justificadas > 0
                ? ` (${justificadas} ${justificadas === 1 ? "justificada" : "justificadas"})`
                : ""
            }.`,
        "Pode conferir no Histórico ou seguir para outra turma.",
      );
      await onFrequenciasMudaram(dia.slice(0, 7));
    } catch (excecao) {
      const falha = excecao instanceof ErroApi ? excecao : null;
      const agendasMudaram =
        (falha?.corpo as { codigo?: string } | undefined)?.codigo === "JUSTIFICATIVAS_ALTERADAS";
      const precisaConfirmarHistorico =
        (falha?.corpo as { codigo?: string } | undefined)?.codigo ===
        "CONFIRMACAO_HISTORICA_NECESSARIA";
      if (precisaConfirmarHistorico && !confirmacaoHistoricaRef.current.confirmar) {
        setConfirmacaoHistoricaAberta(true);
        setErroHistorico("");
        setErro("");
        setErroVariante("indisponivel");
        return;
      }
      if (falha?.conflito || agendasMudaram) {
        const vigente = (falha?.corpo as { frequencia?: Frequencia } | undefined)?.frequencia;
        if (vigente) {
          setRevisaoSalva(vigente.revisao);
          setAtualizadoEm(vigente.atualizadoEm);
        }
        setConflito(true);
      }
      setErro(falha?.message ?? "Não foi possível salvar a chamada.");
      setErroVariante(falha?.conflito || agendasMudaram ? "conflito" : estadoDeErro(excecao));
      if (falha?.status !== 401) {
        publicarAviso({
          id: "chamada-salvar-erro",
          severidade: "error",
          titulo: falha?.message ?? "Não foi possível salvar a chamada.",
          descricao: falha?.conflito
            ? "A chamada foi salva por outra pessoa enquanto esta tela estava aberta. Revise as marcações."
            : undefined,
          duracao: falha?.conflito ? 8000 : undefined,
        });
      }
    } finally {
      setSalvando(false);
    }
  });

  function descartar() {
    try {
      sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
    } catch {
      publicarAviso({
        id: "chamada-descartar-erro",
        severidade: "error",
        titulo: "Não foi possível remover o rascunho local. Ele pode reaparecer ao recarregar.",
      });
      return;
    }
    setRecarregar((valor) => valor + 1);
    publicarAviso({
      id: "chamada-descartado",
      severidade: "info",
      titulo: "Rascunho descartado.",
      descricao: "As marcações voltaram para a última versão salva.",
    });
  }

  function cancelarHistorico(): void {
    confirmacaoHistoricaRef.current = { confirmar: false, motivo: "" };
    setMotivoHistorico("");
    setErroHistorico("");
  }

  function confirmarDesbloqueio(): void {
    if (desbloqueio === "sabado") {
      setSabadoDesbloqueado(chave);
    } else if (desbloqueio === "chamada") {
      setEdicaoLiberada(true);
      setAulasAbertas(null);
    }
  }

  const rotuloDia = dia ? dia.split("-").reverse().join("/") : "";
  const diaDaSemana = dia ? rotuloDiaSemana(dia).replace("-feira", "") : "";
  const tituloResumo = dia === diaCorrente ? "Resumo de hoje" : "Resumo do dia";
  const dataSalva = atualizadoEm ? dataNoFuso(atualizadoEm, fuso) : "";
  const horaSalva = atualizadoEm ? horaNoFuso(atualizadoEm, fuso) : "";
  const correcao = revisaoSalva > 0;
  const desbloqueioSabado = desbloqueio === "sabado";
  const tituloDesbloqueio = desbloqueioSabado
    ? "Desbloquear sábado letivo?"
    : "Desbloquear chamada?";
  const descricaoDesbloqueio = desbloqueioSabado
    ? `Deseja liberar a chamada de ${turma?.rotulo ?? "turma"} neste sábado letivo?`
    : `A chamada de ${turma?.rotulo ?? "turma"} em ${rotuloDia} está salva e bloqueada. Deseja liberar uma correção?`;

  const tituloEstado = carregando
    ? "Carregando..."
    : conflito
      ? "Conflito"
      : salvando
        ? "Salvando..."
        : erro
          ? sujo
            ? "Falha ao salvar"
            : "Falha ao carregar"
          : !leituraConfirmada
            ? "Carregando..."
            : sujo
              ? revisaoSalva === 0
                ? "Em andamento"
                : "Alterações não salvas"
              : atualizadoEm
                ? dataSalva && horaSalva
                  ? `Salva em ${dataSalva} às ${horaSalva}`
                  : "Chamada salva"
                : ehSabado && !sabadoLiberado
                  ? "Sábado bloqueado"
                  : participantes.length === 0
                    ? "Sem alunos"
                    : "Não iniciada";

  // Sem turmas cadastradas ou visíveis, o estado vazio explica o próximo passo.
  if (!temTurmas) {
    return (
      <LayoutConteudo largura="leitura">
        <Box component="section" aria-label="Fazer chamada">
          <Typography component="h1" tabIndex={-1} sx={VISUALMENTE_OCULTO}>
            Chamada
          </Typography>
          <TelaEstado
            incorporado
            variante="indisponivel"
            titulo="Nenhuma turma cadastrada"
            descricao={
              podeAdministrar
                ? "Cadastre séries, turmas e alunos na área de Gestão para começar."
                : "Peça à administração para cadastrar as turmas e os alunos da escola."
            }
            acao={
              podeAdministrar && onAbrirGestao
                ? { rotulo: "Ir para a Gestão", onClick: onAbrirGestao }
                : undefined
            }
          />
        </Box>
      </LayoutConteudo>
    );
  }

  const estadoMarca = (alunoId: string): "P" | "F" | "FJ" | "D" => {
    if (desistentesDaTurma.has(alunoId)) return "D";
    if (!ausencias.has(alunoId)) return "P";
    return justificativas.get(alunoId) ? "FJ" : "F";
  };

  const barraSalvamento = nav.resumo ? null : (
    <BarraSalvamento ref={registrarBarraSalvamento}>
      <Typography
        component="p"
        aria-live="polite"
        variant="body2"
        title={feriado?.nome}
        sx={{
          minWidth: 0,
          flex: 1,
          color: "text.secondary",
          fontWeight: 500,
          overflowWrap: "anywhere",
        }}
      >
        {feriado ? "Feriado" : tituloEstado}
      </Typography>
      {sujo && (
        <BotaoIcone
          rotulo="Descartar"
          title="Descartar alterações"
          variante="texto"
          icone={<RestartAltRoundedIcon fontSize="small" />}
          disabled={salvando}
          data-acao-barra="descartar"
          onClick={(evento) => {
            gatilhoDoDescarteRef.current = evento.currentTarget;
            setDescartarAberto(true);
          }}
          sx={{
            flexShrink: 0,
            width: TOKENS_LAYOUT.alvoToque,
            height: TOKENS_LAYOUT.alvoToque,
          }}
        />
      )}
      <Botao
        variante="principal"
        tamanho="pequeno"
        data-acao-barra="salvar"
        onClick={(evento) => {
          gatilhoDaRevisaoRef.current = evento.currentTarget;
          setConfirmarSalvamento(true);
        }}
        disabled={!podeSalvar}
        carregando={salvando}
        icone={
          atualizadoEm && !sujo ? (
            <CloudDoneRoundedIcon fontSize="small" />
          ) : (
            <SaveRoundedIcon fontSize="small" />
          )
        }
        sx={{ flexShrink: 0, minHeight: TOKENS_LAYOUT.alvoToque }}
      >
        {salvando ? "Salvando..." : "Salvar"}
      </Botao>
    </BarraSalvamento>
  );

  return (
    <Box sx={{ p: nav.resumo ? ESPACAMENTO_LATERAL_CONTEUDO : 0 }}>
      <Box
        component="section"
        aria-label="Fazer chamada"
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          minWidth: 0,
          ...(nav.resumo ? { pb: 2 } : {}),
        }}
      >
        <Typography component="h1" tabIndex={-1} sx={VISUALMENTE_OCULTO}>
          Chamada
        </Typography>

        <Grid
          ref={gradeDiariaRef}
          container
          columns={{ xs: 4, sm: 8, md: 12 }}
          columnSpacing={nav.resumo ? 2 : { xs: 2, sm: 3 }}
          rowSpacing={nav.resumo ? 2 : 1}
          sx={{ alignItems: "flex-start", paddingBottom: "var(--reserva-aviso-chamada, 0px)" }}
        >
          <Grid
            size={{ xs: 4, sm: 8, md: 12, xl: nav.resumo ? "auto" : 5 }}
            data-coluna="painel"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: nav.resumo ? 2 : 1,
              minWidth: 0,
              order: { xs: 1, xl: 2 },
              position: { xl: "sticky" },
              top: { xl: 16 },
              ...(nav.resumo ? { width: { xl: "20rem" } } : {}),
            }}
          >
            {turmas.length > 1 && (
              <SeletorTurmaChamada
                turmas={turmas}
                alunos={alunos}
                turmaId={turmaId}
                dia={dia}
                feriado={feriado?.nome}
                frequencias={frequenciasDoDia?.chave === chave ? frequenciasDoDia.frequencias : []}
                coberturaDisponivel={frequenciasDoDia?.chave === chave}
                carregando={carregando}
                temAlteracoes={sujo || conflito}
                travado={travado}
                semCobertura={nav.resumo}
                onEscolher={setTurmaId}
              />
            )}

            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <BotaoIcone
                rotulo="Dia anterior"
                variante="contorno"
                icone={<ChevronLeftRoundedIcon />}
                disabled={travado || !dia}
                onClick={() => nav.anterior()}
                sx={(tema) => ({
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  border: `1px solid ${tema.vars.palette.divider}`,
                  backgroundColor: tema.vars.palette.background.paper,
                  "&:hover": { backgroundColor: tema.vars.palette.action.hover },
                })}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <SeletorPeriodo
                  id="dia-frequencia"
                  modo="dia"
                  valor={nav.resumo ? (nav.domingo ?? "") : dia}
                  max={diaCorrente}
                  calendarioSemanal
                  mostrarSelo={!nav.resumo}
                  disabled={travado}
                  rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da chamada"}
                  rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : rotuloDia}
                  detalhe={nav.resumo ? "semana" : diaDaSemana}
                  aoHoje={() => {
                    setCarregando(false);
                    nav.voltarParaHoje();
                  }}
                  hojeAtivo={nav.hojeAtivo}
                  onAbertoChange={setCalendarioAberto}
                  onValor={(proximo) => nav.escolherDia(proximo)}
                />
              </Box>
              <BotaoIcone
                rotulo="Dia seguinte"
                variante="contorno"
                icone={<ChevronRightRoundedIcon />}
                disabled={travado || !dia || nav.seguinteDesabilitado}
                onClick={() => nav.seguinte()}
                sx={(tema) => ({
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  border: `1px solid ${tema.vars.palette.divider}`,
                  backgroundColor: tema.vars.palette.background.paper,
                  "&:hover": { backgroundColor: tema.vars.palette.action.hover },
                })}
              />
            </Stack>

            {!nav.resumo && (
              <Stack
                direction="row"
                sx={{
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  columnGap: 1,
                  rowGap: 0.5,
                }}
              >
                {turma && (
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {turma.rotulo}
                  </Typography>
                )}
                <AtualizadoDaVisao fuso={fuso} sx={{ whiteSpace: "normal" }} />
              </Stack>
            )}

            {nav.mostrarVoltar && (
              <Botao
                variante="texto"
                tamanho="pequeno"
                disabled={travado}
                onClick={() => {
                  setCarregando(false);
                  nav.voltarParaHoje();
                }}
                sx={{ alignSelf: "flex-start", px: 0 }}
              >
                Voltar para hoje
              </Botao>
            )}

            {!nav.resumo && feriado && (
              <Paper
                role="status"
                variant="outlined"
                elevation={0}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  color: "text.secondary",
                }}
              >
                <EventBusyRoundedIcon fontSize="small" aria-hidden="true" />
                <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  Feriado · {feriado.nome}
                </Typography>
              </Paper>
            )}

            {!nav.resumo && (
              <>
                {sujo && (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Salve ou descarte as alterações para mudar a data ou a turma.
                  </Typography>
                )}

                {configuracoes.frequenciaPorAula && aulasDoDia.length > 1 && (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    useFlexGap
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Aulas do dia:
                    </Typography>
                    {aulasDoDia.map((aula) => (
                      <Selo
                        key={aula.id}
                        rotulo={`${aula.ordem}ª ${aula.inicio}`}
                        tom="neutro"
                        tamanho="pequeno"
                      />
                    ))}
                  </Stack>
                )}
                {revisaoSalva > 0 && !aulasRegistradas && !carregando && (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Aulas estimadas pela grade atual; esta chamada não guardou o retrato das aulas.
                  </Typography>
                )}
                {!carregando && contagemParciais > 0 && (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {contagemParciais === 1
                      ? "1 aluno saiu em parte das aulas."
                      : `${contagemParciais} alunos saíram em parte das aulas.`}
                  </Typography>
                )}

                <Stack
                  direction={ehSabado ? "column" : "row"}
                  spacing={1}
                  sx={{
                    "& > button": {
                      flex: "1 1 0",
                      minWidth: 0,
                      minHeight: TOKENS_LAYOUT.alvoToque,
                    },
                  }}
                >
                  <Botao
                    type="button"
                    variante="contorno"
                    aria-label={tituloResumo}
                    aria-expanded={resumoAberto}
                    aria-controls={idResumo}
                    onClick={() => setResumoAberto((atual) => !atual)}
                    icone={<InsightsRoundedIcon fontSize="small" />}
                  >
                    Resumo
                    <ExpandMoreRoundedIcon
                      aria-hidden="true"
                      fontSize="small"
                      sx={{
                        ml: 1,
                        transform: resumoAberto ? "rotate(180deg)" : "rotate(0deg)",
                        transition: semMovimento ? "none" : "transform 150ms ease",
                      }}
                    />
                  </Botao>
                  {ehSabado && !feriado && (
                    <Botao
                      type="button"
                      variante="contorno"
                      aria-pressed={sabadoLiberado}
                      disabled={ocupado || !leituraConfirmada || sabadoLiberado || !temAulasAtivas}
                      title={
                        !temAulasAtivas
                          ? "Cadastre aulas ativas na Gestão."
                          : !leituraConfirmada
                            ? "Aguarde a leitura da chamada. Em caso de falha, tente novamente."
                            : "Libera a chamada somente para esta turma e este sábado."
                      }
                      onClick={() => {
                        if (ocupado || !leituraConfirmada || sabadoLiberado || !temAulasAtivas)
                          return;
                        setDesbloqueio("sabado");
                      }}
                      icone={
                        sabadoLiberado ? (
                          <CheckCircleRoundedIcon fontSize="small" />
                        ) : (
                          <LockOpenRoundedIcon fontSize="small" />
                        )
                      }
                      sx={{ whiteSpace: "normal", px: 2 }}
                    >
                      {sabadoLiberado ? "Sábado letivo" : "Desbloquear sábado letivo"}
                    </Botao>
                  )}
                  {revisaoSalva > 0 && (
                    <Botao
                      type="button"
                      variante="contorno"
                      aria-label={`${chamadaBloqueada ? "Desbloquear" : "Bloquear"} chamada de ${turma?.rotulo ?? ""} em ${rotuloDia}${chamadaBloqueada ? ", editar chamada" : ""}`}
                      disabled={ocupado || (edicaoLiberada && sujo)}
                      onClick={() => {
                        if (ocupado || (edicaoLiberada && sujo)) return;
                        if (chamadaBloqueada) {
                          setDesbloqueio("chamada");
                        } else {
                          setEdicaoLiberada(false);
                          setAulasAbertas(null);
                        }
                      }}
                      icone={
                        chamadaBloqueada ? (
                          <EditRoundedIcon fontSize="small" />
                        ) : (
                          <LockRoundedIcon fontSize="small" />
                        )
                      }
                    >
                      {chamadaBloqueada ? "Editar" : "Bloquear"}
                    </Botao>
                  )}
                </Stack>

                {erro || conflito ? (
                  <Fade in appear={!semMovimento} timeout={semMovimento ? 0 : 180}>
                    <Box>
                      {conflito ? (
                        <AlertaCompacto
                          variante="conflito"
                          titulo="A chamada foi salva em outro aparelho"
                          descricao={erro || undefined}
                          tamanho="linha"
                          acao={{ rotulo: "Recarregar versão salva", onClick: descartar }}
                        />
                      ) : (
                        <AlertaCompacto
                          variante={erroVariante}
                          descricao={erro}
                          tamanho="linha"
                          acao={
                            !sujo
                              ? {
                                  rotulo: "Tentar novamente",
                                  onClick: () => setRecarregar((valor) => valor + 1),
                                }
                              : undefined
                          }
                        />
                      )}
                    </Box>
                  </Fade>
                ) : null}
              </>
            )}
            {painelLateral && barraSalvamento}
          </Grid>

          <Grid
            ref={colunaAlunosRef}
            size={{ xs: 4, sm: 8, md: 12, xl: nav.resumo ? "grow" : 7 }}
            data-coluna="lista"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: nav.resumo ? 2 : 1,
              minWidth: 0,
              order: { xs: 2, xl: 1 },
            }}
          >
            {nav.resumo && nav.semana ? (
              <VistaResumoSemana
                turmas={turmasDoResumo}
                alunos={alunos}
                dias={nav.semana}
                domingo={nav.domingo}
                feriados={configuracoes.feriados}
                configuracoes={configuracoes}
                mostrarSaidas={configuracoes.saidaAntecipada}
                versao={versaoFrequencias + recarregar}
                contexto="chamada"
                ativo={ativo}
                pausado={calendarioAberto}
                viewId="chamada"
                fuso={fuso}
                onAbrirDia={(proximo) => nav.escolherDia(proximo)}
              />
            ) : (
              <>
                <Collapse in={resumoAberto} timeout={semMovimento ? 0 : "auto"} unmountOnExit>
                  <Paper
                    id={idResumo}
                    component="section"
                    role="region"
                    aria-label={tituloResumo}
                    variant="outlined"
                    elevation={0}
                    sx={{ overflow: "hidden" }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        borderBottom: 1,
                        borderColor: "divider",
                        backgroundColor: "action.hover",
                        px: 2,
                        py: 1,
                      }}
                    >
                      <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {tituloResumo}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
                      >
                        {leituraConfirmada && revisaoSalva === 0 && !erro ? "Prévia · " : ""}
                        {rotuloDia}
                      </Typography>
                    </Box>
                    <Box sx={{ borderBottom: 1, borderColor: "divider", p: 1.5 }}>
                      <Stack direction="row" spacing={1} aria-label="Resumo da chamada">
                        {(
                          [
                            ["faltas", "Faltas", contagemFaltas],
                            ["justificadas", "Justificadas", contagemJustificadas],
                            ["presentes", "Presentes", contagemPresencas],
                          ] as const
                        ).map(([valorFiltro, rotulo, quantidade]) => {
                          const selecionado = filtro === valorFiltro;
                          return (
                            <ButtonBase
                              key={valorFiltro}
                              type="button"
                              aria-pressed={selecionado}
                              onClick={() =>
                                setFiltro((atual) =>
                                  atual === valorFiltro ? "todos" : valorFiltro,
                                )
                              }
                              sx={(tema) => ({
                                display: "flex",
                                flex: "1 1 0",
                                minWidth: 0,
                                minHeight: 64,
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.25,
                                px: 1,
                                py: 1,
                                border: `1px solid ${selecionado ? tema.vars.palette.primary.main : tema.vars.palette.divider}`,
                                borderRadius: 2,
                                backgroundColor:
                                  selecionado && valorFiltro === "faltas"
                                    ? tema.vars.palette.falta.fraco
                                    : selecionado && valorFiltro === "justificadas"
                                      ? tema.vars.palette.justificada.fraco
                                      : selecionado
                                        ? tema.vars.palette.action.selected
                                        : tema.vars.palette.background.paper,
                              })}
                            >
                              <Typography
                                component="span"
                                variant="h5"
                                sx={{
                                  fontWeight: 600,
                                  fontVariantNumeric: "tabular-nums",
                                  color:
                                    valorFiltro === "faltas"
                                      ? "falta.texto"
                                      : valorFiltro === "justificadas"
                                        ? "justificada.texto"
                                        : "primary.main",
                                }}
                              >
                                {carregando ? "" : quantidade}
                              </Typography>
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  fontWeight: 500,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {rotulo}
                              </Typography>
                            </ButtonBase>
                          );
                        })}
                      </Stack>
                    </Box>
                    {(() => {
                      const ausentes = ativosDaTurma.filter((aluno) => ausencias.has(aluno.id));
                      if (ausentes.length === 0) {
                        return (
                          <Typography
                            variant="body2"
                            sx={{ px: 2, py: 1.5, color: "text.secondary" }}
                          >
                            Nenhuma falta nesta chamada.
                          </Typography>
                        );
                      }
                      return (
                        <List disablePadding>
                          {ausentes.map((aluno) => {
                            const acumulado = acumuladoDe(aluno.id);
                            const codigo = justificativas.get(aluno.id);
                            return (
                              <ListItem
                                key={aluno.id}
                                divider
                                sx={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 1.5,
                                  px: 2,
                                  py: 1.25,
                                }}
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                                    {nomeNaChamada(
                                      aluno.nome,
                                      mostrarOrigem,
                                      aluno.turmaOriginalId !== turmaId,
                                    )}
                                    {codigo ? (
                                      <Box
                                        component="span"
                                        sx={{ ml: 1, color: "primary.main", fontWeight: 600 }}
                                      >
                                        {codigo}
                                      </Box>
                                    ) : null}
                                  </Typography>
                                  {(mostrarOrigem || codigo) && (
                                    <Typography
                                      variant="caption"
                                      noWrap
                                      sx={{ display: "block", color: "text.secondary" }}
                                    >
                                      {mostrarOrigem
                                        ? `Origem ${rotuloOrigemDe(aluno.turmaOriginalId)}`
                                        : ""}
                                      {codigo
                                        ? `${mostrarOrigem ? " · " : ""}${rotuloJustificativa(codigo, catalogoJustificativas)}`
                                        : ""}
                                    </Typography>
                                  )}
                                </Box>
                                <Stack spacing={0.5} sx={{ flexShrink: 0, alignItems: "flex-end" }}>
                                  {acumulado ? (
                                    <>
                                      <CirculosAcumulado
                                        faltas={acumulado.faltas}
                                        justificadas={acumulado.faltasJustificadas}
                                      />
                                      <Typography
                                        variant="caption"
                                        sx={{ color: "text.secondary" }}
                                      >
                                        no mês
                                      </Typography>
                                    </>
                                  ) : (
                                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                      {resumo ? "sem faltas no mês" : "-"}
                                    </Typography>
                                  )}
                                </Stack>
                              </ListItem>
                            );
                          })}
                        </List>
                      );
                    })()}
                  </Paper>
                </Collapse>

                <Paper variant="outlined" elevation={0} sx={{ overflow: "hidden" }}>
                  {mostrarSituacao && (
                    <Box
                      role="region"
                      aria-label="Situação da chamada"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        borderBottom: 1,
                        borderColor: "divider",
                        px: 2,
                        py: 0.5,
                      }}
                    >
                      {chamadaNaoIniciada ? (
                        <AssignmentRoundedIcon
                          fontSize="small"
                          aria-hidden="true"
                          sx={{ color: "text.secondary", flexShrink: 0 }}
                        />
                      ) : sujo ? (
                        <EditRoundedIcon
                          fontSize="small"
                          aria-hidden="true"
                          sx={{ color: "alerta.texto", flexShrink: 0 }}
                        />
                      ) : (
                        <CloudDoneRoundedIcon
                          fontSize="small"
                          aria-hidden="true"
                          sx={{ color: "primary.main", flexShrink: 0 }}
                        />
                      )}
                      <Stack spacing={0.5} useFlexGap sx={{ minWidth: 0, flex: 1 }}>
                        <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {salvando ? "Salvando..." : tituloSituacao}
                        </Typography>
                        {(chamadaNaoIniciada || sujo) && (
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            {chamadaNaoIniciada
                              ? "Confira os alunos e salve."
                              : "Salve para confirmar."}
                          </Typography>
                        )}
                      </Stack>
                      {chamadaNaoIniciada && (
                        <Botao
                          variante="texto"
                          tamanho="pequeno"
                          disabled={bloqueado}
                          onClick={iniciarChamada}
                          icone={<PlayArrowRoundedIcon fontSize="small" />}
                          sx={{ minHeight: TOKENS_LAYOUT.alvoToque, flexShrink: 0 }}
                        >
                          Iniciar
                        </Botao>
                      )}
                    </Box>
                  )}

                  {filtro !== "todos" && (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", px: 2, py: 0.5 }}>
                      <Botao
                        variante="texto"
                        tamanho="pequeno"
                        onClick={() => setFiltro("todos")}
                        sx={{ px: 0 }}
                      >
                        Ver todos
                      </Botao>
                    </Box>
                  )}

                  {carregando ? (
                    <Stack spacing={1} sx={{ minHeight: 160, p: 2 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          alignItems: "center",
                          justifyContent: "center",
                          color: "text.secondary",
                        }}
                      >
                        <Typography variant="body2">Carregando chamada...</Typography>
                      </Stack>
                      {[0, 1, 2].map((linha) => (
                        <Skeleton
                          key={linha}
                          variant="rounded"
                          height={TOKENS_LAYOUT.tabela.linha}
                        />
                      ))}
                    </Stack>
                  ) : ativosDaTurma.length === 0 ? (
                    <EstadoVazio
                      icone={<SchoolRoundedIcon />}
                      titulo="Nenhum aluno ativo nesta turma"
                      descricao={
                        podeAdministrar
                          ? "Cadastre alunos na área de Gestão."
                          : "Peça ao administrador para cadastrar os alunos desta turma."
                      }
                    />
                  ) : visiveis.length === 0 ? (
                    <EstadoVazio
                      icone={<AssignmentRoundedIcon />}
                      titulo={
                        filtro === "faltas"
                          ? "Nenhuma falta nesta chamada."
                          : "Nenhum aluno neste filtro."
                      }
                      descricao="O filtro atual não tem alunos para mostrar."
                      acao={
                        <Botao variante="texto" onClick={() => setFiltro("todos")}>
                          Mostrar todos
                        </Botao>
                      }
                    />
                  ) : (
                    <List
                      ref={listaAlunosRef}
                      aria-label="Alunos da chamada"
                      disablePadding
                      sx={{ py: 0 }}
                    >
                      {visiveis.map((aluno) => {
                        const nomeExibido = nomeNaChamada(
                          aluno.nome,
                          mostrarOrigem,
                          aluno.turmaOriginalId !== turmaId,
                        );
                        const desistente = desistentesDaTurma.has(aluno.id);
                        const faltando = !desistente && ausencias.has(aluno.id);
                        const marcadas = ausencias.get(aluno.id)?.size ?? 0;
                        const parcial =
                          faltando && totalAulasDoDia > 0 && marcadas < totalAulasDoDia;
                        const codigo = justificativas.get(aluno.id) ?? "";
                        const mostrarJustificativa = faltando && !chamadaBloqueada;
                        const justificativaSalva = faltando && chamadaBloqueada && Boolean(codigo);
                        const mostrarAulas =
                          faltando &&
                          configuracoes.frequenciaPorAula &&
                          aulasAbertas === aluno.id &&
                          aulasDoDia.length > 1;
                        const acumulado = acumuladoDe(aluno.id);
                        const temAcumulado = Boolean(
                          acumulado && (acumulado.faltas > 0 || acumulado.faltasJustificadas > 0),
                        );
                        const alertasBeneficios = alertasDoAluno(aluno.id);
                        const esmaecida = desistente || (bloqueado && !chamadaBloqueada);
                        const estado = estadoMarca(aluno.id);
                        return (
                          <ListItem
                            key={aluno.id}
                            disablePadding
                            divider
                            sx={{ display: "block", backgroundColor: "background.paper" }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "stretch",
                              }}
                            >
                              <Box
                                data-faixa-toque
                                data-aluno={aluno.id}
                                sx={{
                                  display: "flex",
                                  minHeight: TOKENS_LAYOUT.tabela.linha,
                                  minWidth: 0,
                                  flex: 1,
                                  alignItems: "center",
                                  gap: 1,
                                  px: { xs: 1, sm: 2 },
                                  py: 0.5,
                                  position: "relative",
                                  ...(bloqueado || desistente
                                    ? {}
                                    : { "&:hover": { backgroundColor: "action.hover" } }),
                                }}
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      minWidth: 0,
                                      alignItems: "center",
                                      gap: 1,
                                      opacity: esmaecida ? 0.6 : 1,
                                    }}
                                  >
                                    <ButtonBase
                                      type="button"
                                      data-marcar-falta
                                      aria-pressed={faltando}
                                      disabled={bloqueado || desistente}
                                      aria-label={`${nomeExibido}${
                                        mostrarOrigem
                                          ? `, turma original ${rotuloOrigemDe(aluno.turmaOriginalId)}`
                                          : ""
                                      }: ${
                                        desistente
                                          ? "desistente. Marcação bloqueada."
                                          : faltando
                                            ? `${codigo ? `falta justificada, ${rotuloJustificativa(codigo, catalogoJustificativas)}` : "falta"} em ${marcadas} de ${totalAulasDoDia} aulas. Toque para voltar a presente.`
                                            : chamadaNaoIniciada
                                              ? "presença inicial, chamada não iniciada. Toque para marcar falta."
                                              : "presente. Toque para marcar falta."
                                      }${
                                        temAcumulado && acumulado
                                          ? ` No mês. ${fraseAcumulado(acumulado.faltas, acumulado.faltasJustificadas)}`
                                          : ""
                                      }`}
                                      onClick={() => alternarFalta(aluno.id)}
                                      sx={(tema) => ({
                                        position: "static",
                                        display: "flex",
                                        minWidth: 0,
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                        gap: 1,
                                        borderRadius: 1,
                                        color: "text.primary",
                                        textAlign: "left",
                                        "&::after": {
                                          content: '""',
                                          position: "absolute",
                                          inset: 0,
                                        },
                                        "&.Mui-focusVisible::after": {
                                          outline: `3px solid ${tema.vars.palette.primary.main}`,
                                          outlineOffset: -3,
                                        },
                                        "&.Mui-disabled": {
                                          color: "text.primary",
                                          cursor: "not-allowed",
                                        },
                                      })}
                                    >
                                      <Typography
                                        component="span"
                                        variant="body2"
                                        sx={{
                                          minWidth: 0,
                                          overflowWrap: "anywhere",
                                          fontWeight: faltando ? 600 : 500,
                                        }}
                                      >
                                        {nomeExibido}
                                      </Typography>
                                      {desistente && (
                                        <Selo component="span" rotulo="DESISTENTE" tom="neutro" />
                                      )}
                                    </ButtonBase>
                                  </Box>
                                  {justificativaSalva && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        mt: 0.5,
                                        display: "block",
                                        color: "justificada.texto",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {rotuloJustificativa(codigo, catalogoJustificativas)}
                                    </Typography>
                                  )}
                                  {parcial ||
                                  (temAcumulado && acumulado) ||
                                  alertasBeneficios.length > 0 ? (
                                    <Stack
                                      direction="row"
                                      spacing={0.75}
                                      useFlexGap
                                      sx={{
                                        mt: 0.5,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                      }}
                                    >
                                      {parcial ? (
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color: "falta.texto",
                                            opacity: esmaecida ? 0.6 : 1,
                                          }}
                                        >
                                          saiu em parte das aulas
                                        </Typography>
                                      ) : temAcumulado && acumulado ? (
                                        <Stack
                                          direction="row"
                                          spacing={0.5}
                                          sx={{
                                            alignItems: "center",
                                            opacity: esmaecida ? 0.6 : 1,
                                          }}
                                        >
                                          <Typography
                                            variant="caption"
                                            sx={{ color: "text.secondary" }}
                                          >
                                            No mês
                                          </Typography>
                                          <CirculosAcumulado
                                            faltas={acumulado.faltas}
                                            justificadas={acumulado.faltasJustificadas}
                                          />
                                        </Stack>
                                      ) : null}
                                      {alertasBeneficios.length > 0 && (
                                        <AvisoBeneficioFrequencia
                                          nome={nomeExibido}
                                          alertas={alertasBeneficios}
                                        />
                                      )}
                                    </Stack>
                                  ) : null}
                                </Box>
                                <Grow
                                  key={estado}
                                  in
                                  appear={!semMovimento}
                                  timeout={semMovimento ? 0 : 160}
                                >
                                  <Box
                                    component="span"
                                    aria-hidden="true"
                                    data-estado={estado}
                                    data-nao-iniciada={
                                      chamadaNaoIniciada && !desistente && !faltando
                                    }
                                    sx={(tema) => estilosMarca(tema, estado)}
                                  >
                                    {estado === "FJ" && (
                                      <DescriptionRoundedIcon
                                        fontSize="small"
                                        sx={{ color: "inherit" }}
                                      />
                                    )}
                                    {estado === "D"
                                      ? "D"
                                      : estado === "FJ"
                                        ? "FJ"
                                        : estado === "F"
                                          ? "F"
                                          : "P"}
                                  </Box>
                                </Grow>
                              </Box>
                              {faltando &&
                                configuracoes.frequenciaPorAula &&
                                aulasDoDia.length > 1 && (
                                  <Botao
                                    type="button"
                                    variante="contorno"
                                    tamanho="pequeno"
                                    aria-expanded={aulasAbertas === aluno.id}
                                    aria-label={`Aulas em que ${nomeExibido} faltou`}
                                    disabled={bloqueado}
                                    onClick={() =>
                                      setAulasAbertas((atual) =>
                                        atual === aluno.id ? null : aluno.id,
                                      )
                                    }
                                    sx={{ alignSelf: "center", mr: 2, my: 1, flexShrink: 0 }}
                                  >
                                    Aulas
                                  </Botao>
                                )}
                            </Box>
                            {(mostrarJustificativa || mostrarAulas) && (
                              <Box sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 1.5 }}>
                                {mostrarJustificativa && (
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    useFlexGap
                                    sx={{ flexWrap: "wrap", alignItems: "center" }}
                                  >
                                    <Box sx={{ width: { xs: "100%", sm: 256 } }}>
                                      <Selecionar
                                        id={`justificativa-${aluno.id}`}
                                        valor={codigo}
                                        onValor={(valor) => definirJustificativa(aluno.id, valor)}
                                        disabled={bloqueado}
                                        ariaLabel={`Justificativa da falta de ${nomeExibido}`}
                                        opcoes={opcoesJustificativa}
                                      />
                                    </Box>
                                    {codigo === JUSTIFICATIVA_OUTROS && (
                                      <Box sx={{ width: { xs: "100%", sm: 256 } }}>
                                        <CampoTexto
                                          id={`observacao-${aluno.id}`}
                                          valor={observacoes.get(aluno.id) ?? ""}
                                          onValor={(texto) => definirObservacao(aluno.id, texto)}
                                          maxLength={200}
                                          disabled={bloqueado}
                                          placeholder="Observação"
                                          ariaLabel={`Observação da falta de ${nomeExibido}`}
                                          tamanho="pequeno"
                                        />
                                      </Box>
                                    )}
                                  </Stack>
                                )}
                                {mostrarAulas && (
                                  <Box sx={{ mt: 1.5 }}>
                                    <Stack
                                      direction="row"
                                      spacing={0.75}
                                      useFlexGap
                                      sx={{ flexWrap: "wrap" }}
                                    >
                                      {aulasDoDia.map((aula) => {
                                        const marcada =
                                          ausencias.get(aluno.id)?.has(aula.id) ?? false;
                                        return (
                                          <ButtonBase
                                            key={aula.id}
                                            type="button"
                                            aria-pressed={marcada}
                                            disabled={bloqueado}
                                            onClick={() => alternarAula(aluno.id, aula.id)}
                                            sx={(tema) => ({
                                              minHeight: 48,
                                              borderRadius: 2,
                                              px: 1.5,
                                              fontVariantNumeric: "tabular-nums",
                                              fontSize: "0.75rem",
                                              fontWeight: 500,
                                              border: `1px solid ${
                                                marcada
                                                  ? tema.vars.palette.falta.main
                                                  : "transparent"
                                              }`,
                                              backgroundColor: marcada
                                                ? tema.vars.palette.falta.fraco
                                                : tema.vars.palette.action.hover,
                                              color: marcada
                                                ? tema.vars.palette.falta.texto
                                                : tema.vars.palette.text.primary,
                                              "&.Mui-disabled": {
                                                backgroundColor:
                                                  tema.vars.palette.action.disabledBackground,
                                                color: tema.vars.palette.text.disabled,
                                              },
                                            })}
                                          >
                                            {aula.ordem}ª {aula.inicio}
                                          </ButtonBase>
                                        );
                                      })}
                                    </Stack>
                                    <Stack
                                      direction="row"
                                      spacing={1.5}
                                      sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}
                                    >
                                      <Botao
                                        variante="texto"
                                        tamanho="pequeno"
                                        disabled={bloqueado}
                                        onClick={() =>
                                          definirAulas(
                                            aluno.id,
                                            aulasDoDia.map((aula) => aula.id),
                                          )
                                        }
                                        sx={{ px: 0 }}
                                      >
                                        Todas
                                      </Botao>
                                      <Botao
                                        variante="texto"
                                        tamanho="pequeno"
                                        disabled={bloqueado}
                                        onClick={() => definirAulas(aluno.id, [])}
                                        sx={{ px: 0 }}
                                      >
                                        Nenhuma
                                      </Botao>
                                    </Stack>
                                  </Box>
                                )}
                              </Box>
                            )}
                          </ListItem>
                        );
                      })}
                    </List>
                  )}
                </Paper>
              </>
            )}
          </Grid>
        </Grid>

        {!painelLateral && barraSalvamento}
      </Box>

      <DialogoConfirmacao
        aberto={confirmarSalvamento}
        titulo={correcao ? "Salvar correção da chamada?" : "Salvar chamada?"}
        descricao={
          <Stack spacing={1.5}>
            <Typography variant="body2">
              {correcao
                ? `A versão salva de ${turma?.rotulo ?? "turma"} em ${rotuloDia} será substituída pelas marcações atuais e a chamada voltará a ficar bloqueada.`
                : `Confira as marcações de ${turma?.rotulo ?? "turma"} em ${rotuloDia}. A chamada será bloqueada para edição depois do salvamento.`}
            </Typography>
            <Stack
              direction="row"
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                backgroundColor: "background.paper",
              }}
            >
              {(
                [
                  ["Faltas", contagemFaltas, "falta.texto"],
                  ["Justificadas", contagemJustificadas, "justificada.texto"],
                  ["Presentes", contagemPresencas, "primary.main"],
                ] as const
              ).map(([rotulo, valor, cor], indice) => (
                <Box
                  key={rotulo}
                  sx={{
                    display: "flex",
                    flex: "1 1 0",
                    minWidth: 0,
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.25,
                    px: 1,
                    py: 1.5,
                    ...(indice > 0 ? { borderLeft: 1, borderColor: "divider" } : {}),
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 500,
                      overflowWrap: "anywhere",
                      textAlign: "center",
                    }}
                  >
                    {rotulo}
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: cor }}
                  >
                    {valor}
                  </Typography>
                </Box>
              ))}
            </Stack>
            {sabadoLiberado && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Sábado letivo liberado para esta turma e data.
              </Typography>
            )}
          </Stack>
        }
        onConfirmar={() => {
          setConfirmarSalvamento(false);
          void salvar();
        }}
        onCancelar={() => setConfirmarSalvamento(false)}
        aposFechar={() => {
          restaurarGatilhoSeMoveu(gatilhoDaRevisaoRef.current);
          gatilhoDaRevisaoRef.current = null;
        }}
        rotuloConfirmar="Salvar chamada"
        rotuloCancelar="Continuar revisando"
        operacaoEmAndamento={salvando}
      />

      <DialogoConfirmacao
        aberto={descartarAberto}
        titulo="Descartar alterações?"
        descricao="As marcações não salvas serão descartadas e a última versão salva será recarregada."
        onConfirmar={() => {
          setDescartarAberto(false);
          descartar();
        }}
        onCancelar={() => setDescartarAberto(false)}
        aposFechar={() => {
          restaurarGatilhoSeMoveu(gatilhoDoDescarteRef.current);
          gatilhoDoDescarteRef.current = null;
        }}
        rotuloConfirmar="Descartar"
        rotuloCancelar="Continuar marcando"
        destrutivo
      />

      <DialogoConfirmacao
        aberto={desbloqueio !== null}
        titulo={tituloDesbloqueio}
        descricao={descricaoDesbloqueio}
        onConfirmar={() => {
          setDesbloqueio(null);
          confirmarDesbloqueio();
        }}
        onCancelar={() => setDesbloqueio(null)}
        rotuloConfirmar="Desbloquear"
        rotuloCancelar="Cancelar"
      />

      <Dialogo
        aberto={confirmacaoHistoricaAberta}
        onFechar={() => {
          setConfirmacaoHistoricaAberta(false);
          cancelarHistorico();
        }}
        titulo="Confirmar chamada histórica?"
        descricao={`A composição desta turma em ${rotuloDia} não pôde ser comprovada. Confirme o lançamento e informe o motivo. A confirmação fica registrada na auditoria.`}
        acoes={
          <>
            <Botao
              variante="texto"
              onClick={() => {
                setConfirmacaoHistoricaAberta(false);
                cancelarHistorico();
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="secundario"
              onClick={() => {
                const motivo = motivoHistorico.trim();
                if (motivo.length < 3 || motivo.length > 200) {
                  setErroHistorico(
                    motivo.length < 3
                      ? "Informe um motivo com pelo menos 3 caracteres."
                      : "O motivo deve ter no máximo 200 caracteres.",
                  );
                  return;
                }
                confirmacaoHistoricaRef.current = { confirmar: true, motivo };
                setConfirmacaoHistoricaAberta(false);
                setErroHistorico("");
                void salvar();
              }}
            >
              Confirmar e salvar
            </Botao>
          </>
        }
      >
        <Campo id="motivo-historico" rotulo="Motivo" erro={erroHistorico || undefined}>
          <CampoTexto
            id="motivo-historico"
            valor={motivoHistorico}
            onValor={setMotivoHistorico}
            maxLength={200}
            placeholder="Ex.: chamada do diário de papel"
            erro={erroHistorico || undefined}
          />
        </Campo>
      </Dialogo>
    </Box>
  );
}
