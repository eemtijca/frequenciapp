"use client";

// Shell autenticado: AppBar, gaveta permanente ou modal, visões montadas e
// navegação local preservando rascunhos, rolagem, URL e foco.
import { ProvedorVisibilidadeGraficos } from "@/components/graficos/visibilidade-graficos";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@mui/material/styles";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import AppBar from "@mui/material/AppBar";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Slide from "@mui/material/Slide";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExitToAppRoundedIcon from "@mui/icons-material/ExitToAppRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PieChartRoundedIcon from "@mui/icons-material/PieChartRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import WifiOffRoundedIcon from "@mui/icons-material/WifiOffRounded";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import type {
  Aluno,
  Configuracoes,
  Frequencia,
  JustificativaConfigurada,
  LiberadorConfigurado,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { useSaidasMensais } from "@/components/movimentacoes/use-historico-movimentacoes";
import { temCapacidade, type Identidade } from "@/domain/usuarios";
import { pedir } from "@/lib/api-cliente";
import { expurgarBiNoLogout } from "@/lib/bi-armazenamento";
import { MenuConta, type AcaoConta } from "@/components/conta/menu-conta";
import { ProvedorAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { BotaoAtualizar } from "@/components/ui/mui/botao-atualizar";
import { BotaoIcone } from "@/components/ui/mui/botao";
import { Logotipo } from "@/components/ui/mui/logotipo";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";
import {
  ESPACAMENTO_LATERAL_CONTEUDO,
  LARGURAS_CONTEUDO,
  LayoutConteudo,
  type LarguraConteudo,
} from "@/components/layout/layout-conteudo";
import VistaFrequencia from "@/components/chamada/vista-frequencia";
import VistaChamadaParcial from "@/components/chamada-parcial/vista-frequencia-parcial";
import VistaHorarios from "@/components/horarios/vista-horarios";
import VistaPainel from "@/components/painel/vista-painel";
import VistaMovimentacoes from "@/components/movimentacoes/vista-movimentacoes";
import VistaRelatorios from "@/components/relatorios/vista-relatorios";
import {
  OpcoesRelatorios,
  type DestinoRelatorios,
} from "@/components/relatorios/navegacao-relatorios";
import VistaAlunos from "@/components/alunos/vista-alunos";
import VistaGestao from "@/components/gestao/vista-gestao";
import {
  categoriaDe,
  type CadastroGestao,
  type CategoriaConfiguracoes,
  type DestinoConfiguracoes,
} from "@/components/gestao/destinos-gestao";
import {
  ESTILO_LISTA_GAVETA,
  OpcaoGaveta,
  OpcoesConfiguracoes,
  OpcoesGestao,
} from "@/components/gestao/navegacao-gestao";
import DialogoSenha from "@/components/conta/dialogo-senha";
import DialogoNotificacoes from "@/components/conta/dialogo-notificacoes";
import DialogoSobre from "@/components/dialogo-sobre";
import RegistroPwa from "@/components/pwa/registro-pwa";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";
import { BREAKPOINTS, TOKENS_LAYOUT } from "@/theme/layout";

export type Visao =
  | "painel"
  | "chamada"
  | "horarios"
  | "chamada-parcial"
  | "saidas"
  | "relatorios"
  | "alunos"
  | "gestao";

interface Props {
  usuario: Identidade;
  carregadoEm: string;
  diaCorrente: string;
  fuso: string;
  visaoInicial?: string;
  abaGestaoInicial?: "configuracoes";
  planilhaInicial?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  abaMovimentacaoInicial?: "saidas" | "entradas";
  seriesIniciais: Serie[];
  turmasIniciais: Turma[];
  alunosIniciais: Aluno[];
  frequenciasIniciais: Frequencia[];
  saidasIniciais: SaidaAntecipada[];
  justificativasIniciais: JustificativaConfigurada[];
  liberadoresIniciais: LiberadorConfigurado[];
  configuracoesIniciais: Configuracoes;
  resumoInicial: ResumoAcumulado | null;
}

const CHAVE_AVISO_ENTRADA = "frequenciapp:aviso-entrada";
const TELA_ESTREITA = "@media (max-width:359px)";
const VISOES: Visao[] = [
  "painel",
  "chamada",
  "horarios",
  "chamada-parcial",
  "saidas",
  "relatorios",
  "alunos",
  "gestao",
];

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

function visaoValida(valor: string | undefined): Visao | null {
  // Valores antigos do manifest e de links continuam abrindo a área certa.
  if (valor === "frequencia") return "chamada";
  if (valor === "historico" || valor === "grade") return "relatorios";
  return VISOES.find((visao) => visao === valor) ?? null;
}

function destinoRelatoriosDe(valor: string | undefined): DestinoRelatorios {
  return valor === "historico" || valor === "grade" ? valor : "resumo";
}

function larguraDaVisao(visao: Visao): LarguraConteudo {
  // Relatórios largos e a Grade usam a largura excepcional; o restante lê
  // confortavelmente na largura de leitura ou de gestão.
  if (visao === "relatorios") return "larga";
  if (visao === "gestao") return "gestao";
  return "leitura";
}

interface ItemNav {
  visao: Visao;
  rotulo: string;
  icone: ElementType;
}

const ITENS_INICIAIS: ItemNav[] = [
  { visao: "painel", rotulo: "Painel", icone: PieChartRoundedIcon },
  { visao: "chamada", rotulo: "Chamada", icone: ChecklistRoundedIcon },
  { visao: "horarios", rotulo: "Horários", icone: CalendarMonthRoundedIcon },
];

const ITEM_SAIDAS: ItemNav = {
  visao: "saidas",
  rotulo: "Saídas e Entradas",
  icone: ExitToAppRoundedIcon,
};
const ITEM_RELATORIOS: ItemNav = {
  visao: "relatorios",
  rotulo: "Relatórios",
  icone: TableChartRoundedIcon,
};
const ITEM_CHAMADA_PARCIAL: ItemNav = {
  visao: "chamada-parcial",
  rotulo: "Chamada Parcial",
  icone: AssignmentRoundedIcon,
};

const ITENS_FIM: ItemNav[] = [
  { visao: "alunos", rotulo: "Alunos", icone: PeopleRoundedIcon },
  { visao: "gestao", rotulo: "Gestão", icone: SettingsRoundedIcon },
];

type NivelGaveta = "principal" | "gestao" | "configuracoes" | "relatorios";
type FocoNivel = "voltar" | Exclude<NivelGaveta, "principal">;
type EstadoGaveta = { nivel: NivelGaveta; foco?: FocoNivel; sentido?: "entrar" | "voltar" };

function ListaGaveta({
  estado,
  movel,
  children,
}: {
  estado: EstadoGaveta;
  movel: boolean;
  children: React.ReactNode;
}) {
  const opcoesRef = useRef<HTMLUListElement>(null);
  const limiteRef = useRef<HTMLSpanElement>(null);
  const nivelComFoco = useRef(estado.nivel);
  // Montagens novas (incluindo reabertura do modal) não repetem a última entrada.
  const [entrada, setEntrada] = useState<EstadoGaveta>({ nivel: estado.nivel });
  if (entrada.nivel !== estado.nivel) setEntrada(estado);
  const { animacoesAtivas } = useAnimacoesDaInterface();
  const tema = useTheme();
  const desktop = useMediaQuery(tema.breakpoints.up("md"));
  const visivel = movel !== desktop;
  const voltando = entrada.sentido === "voltar";

  useLayoutEffect(() => {
    if (nivelComFoco.current === estado.nivel) return;
    nivelComFoco.current = estado.nivel;
    const lista = opcoesRef.current;
    if (!visivel || !lista?.getClientRects().length || !estado.foco) return;
    lista.querySelector<HTMLElement>(`[data-foco-gaveta="${estado.foco}"]`)?.focus();
  }, [estado, visivel]);

  return (
    <Box component="nav" aria-label="Seções do aplicativo" sx={{ position: "relative" }}>
      <Box
        component="span"
        ref={limiteRef}
        aria-hidden="true"
        sx={{ position: "absolute", top: 0, left: voltando ? "calc(100% - 24px)" : 24 }}
      />
      <Slide
        key={estado.nivel}
        in
        appear={Boolean(entrada.sentido) && visivel && animacoesAtivas}
        direction={voltando ? "right" : "left"}
        container={(lista) => limiteRef.current ?? lista}
        timeout={tema.transitions.duration.shorter}
      >
        <List
          ref={opcoesRef}
          disablePadding
          sx={{
            ...ESTILO_LISTA_GAVETA,
            // Cancela uma transição em curso sem remontar o item focado.
            ...((!visivel || !animacoesAtivas) && { transition: "none !important" }),
          }}
        >
          {children}
        </List>
      </Slide>
    </Box>
  );
}

type DestinoNavegacao = { visao: Visao; relatorio?: DestinoRelatorios };
type DestinoFocoMenu = "gatilho" | "titulo" | "dialogo" | "largura" | DestinoNavegacao;
type FecharMenu = (destino?: DestinoFocoMenu) => void;

function focarTituloAtivo(conteudo: HTMLElement | null) {
  const painel = conteudo?.querySelector<HTMLElement>("section:not([hidden])[role=group]");
  const tituloConfiguracoes = painel?.querySelector<HTMLElement>(
    "[data-titulo-configuracoes]:not([hidden] *)",
  );
  const tituloRelatorio = painel?.querySelector<HTMLElement>(
    'section[aria-label="Relatórios"] :is(h1, h2):not([hidden] *)',
  );
  const titulo =
    tituloConfiguracoes ??
    tituloRelatorio ??
    painel?.querySelector<HTMLElement>("h1:not([hidden] *)");
  const alvo = titulo ?? painel ?? conteudo;
  if (!alvo) return;
  alvo.tabIndex = -1;
  alvo.focus({ preventScroll: true });
}

// O MUI fixa o prazo no começo de cada fase. Encerrar pela API da transição
// também libera o fundo quando a redução de movimento chega durante a saída.
function useConcluirTransicaoSemMovimento() {
  const { animacoesAtivas } = useAnimacoesDaInterface();
  const concluir = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!animacoesAtivas) {
      concluir.current?.();
      concluir.current = null;
    }
  }, [animacoesAtivas]);

  return {
    duracao: animacoesAtivas ? undefined : 0,
    registrarFim: (_no: HTMLElement, finalizar: () => void) => {
      concluir.current = finalizar;
    },
    limparFim: () => {
      concluir.current = null;
    },
  };
}

interface MenuMovelProps {
  /** Contêiner do app, que recebe a marca de gaveta aberta. */
  raizRef: React.RefObject<HTMLDivElement | null>;
  gatilhoRef: React.RefObject<HTMLButtonElement | null>;
  conteudoRef: React.RefObject<HTMLElement | null>;
  pendente: boolean;
  onAbrir: () => void;
  onFechado: (destino: DestinoFocoMenu) => void;
  renderizarConteudo: (fechar: FecharMenu) => React.ReactNode;
}

/**
 * Botão e gaveta do menu no celular. O estado aberto fica aqui, fora da raiz:
 * abrir e fechar renderiza só a gaveta, sem passar pelas telas montadas.
 */
function MenuMovel({
  raizRef,
  gatilhoRef,
  conteudoRef,
  pendente,
  onAbrir,
  onFechado,
  renderizarConteudo,
}: MenuMovelProps) {
  const [aberto, setAberto] = useState(false);
  // Para onde o foco volta quando a gaveta fecha; em estado, porque o fechamento
  // é passado ao conteúdo durante a renderização.
  const [destinoFoco, setDestinoFoco] = useState<DestinoFocoMenu>("gatilho");
  const idMenu = useId();
  const idTitulo = useId();
  const transicao = useConcluirTransicaoSemMovimento();

  function abrir() {
    onAbrir();
    raizRef.current?.setAttribute("data-gaveta-aberta", "");
    setDestinoFoco("gatilho");
    setAberto(true);
  }

  // A mudança de largura encerra também o modal, liberando o fundo e o foco.
  useEffect(() => {
    const desktop = window.matchMedia(`(min-width: ${BREAKPOINTS.md}px)`);
    function aoMudarLargura() {
      if (!desktop.matches || !aberto) return;
      setDestinoFoco("largura");
      setAberto(false);
    }
    desktop.addEventListener("change", aoMudarLargura);
    return () => desktop.removeEventListener("change", aoMudarLargura);
  }, [aberto]);

  const fechar = useCallback<FecharMenu>((destino = "gatilho") => {
    setDestinoFoco(destino);
    setAberto(false);
  }, []);

  function focarItemAtivo() {
    const painel = document.getElementById(idMenu);
    if (painel?.contains(document.activeElement) && document.activeElement !== painel) return;
    const opcoes = painel?.querySelectorAll<HTMLElement>(
      'nav [aria-current="page"], nav [data-foco-gaveta="voltar"]',
    );
    const visiveis = Array.from(opcoes ?? []).filter((opcao) => opcao.getClientRects().length);
    const ativo =
      visiveis.find((opcao) => opcao.getAttribute("aria-current") === "page") ?? visiveis[0];
    (ativo ?? painel)?.focus();
  }

  function concluirFechamento() {
    // Chega depois de o Material UI devolver o body; a marca já pode sair.
    raizRef.current?.removeAttribute("data-gaveta-aberta");
    onFechado(destinoFoco);
    if (destinoFoco === "gatilho" && gatilhoRef.current?.getClientRects().length) {
      gatilhoRef.current.focus({ preventScroll: true });
    } else if (destinoFoco === "gatilho" || destinoFoco === "titulo") {
      focarTituloAtivo(conteudoRef.current);
    }
  }

  return (
    <>
      <IconButton
        ref={gatilhoRef}
        aria-label="Abrir menu"
        title="Menu"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={abrir}
        sx={{
          position: "relative",
          flexShrink: 0,
          width: TOKENS_LAYOUT.alvoToque,
          height: TOKENS_LAYOUT.alvoToque,
        }}
      >
        <MenuRoundedIcon />
        {pendente ? (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "falta.main",
            }}
          />
        ) : null}
      </IconButton>
      <Drawer
        open={aberto}
        onClose={() => fechar("gatilho")}
        variant="temporary"
        anchor="left"
        transitionDuration={transicao.duracao}
        disableRestoreFocus
        disableEnforceFocus={destinoFoco === "dialogo"}
        slotProps={{
          paper: {
            id: idMenu,
            "aria-labelledby": idTitulo,
            sx: {
              width: TOKENS_LAYOUT.gaveta,
              maxWidth: "100vw",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              height: "100%",
            },
          },
          transition: {
            addEndListener: transicao.registrarFim,
            onEntered: () => {
              transicao.limparFim();
              focarItemAtivo();
            },
            onExited: () => {
              transicao.limparFim();
              concluirFechamento();
            },
          },
        }}
      >
        <Typography id={idTitulo} component="h2" sx={VISUALMENTE_OCULTO}>
          Menu do aplicativo
        </Typography>
        {renderizarConteudo(fechar)}
      </Drawer>
    </>
  );
}

interface DialogoPendenciaProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  destrutivo?: boolean;
  desabilitado?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
  onFechado: () => void;
}

function DialogoPendencia({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  destrutivo = false,
  desabilitado = false,
  onCancelar,
  onConfirmar,
  onFechado,
}: DialogoPendenciaProps) {
  const tituloId = useId();
  const descricaoId = useId();
  const padding = `${TOKENS_LAYOUT.dialogo.padding}px`;
  const transicao = useConcluirTransicaoSemMovimento();

  return (
    <Dialog
      open={aberto}
      onClose={onCancelar}
      fullWidth
      maxWidth="sm"
      role="alertdialog"
      aria-labelledby={tituloId}
      aria-describedby={descricaoId}
      disableRestoreFocus
      transitionDuration={transicao.duracao}
      slotProps={{
        paper: {
          sx: {
            maxWidth: `${TOKENS_LAYOUT.dialogo.larguraMaxima}px`,
            borderRadius: `${TOKENS_LAYOUT.dialogo.raio}px`,
          },
        },
        transition: {
          addEndListener: transicao.registrarFim,
          onEntered: transicao.limparFim,
          onExited: () => {
            transicao.limparFim();
            onFechado();
          },
        },
      }}
    >
      <DialogTitle id={tituloId} sx={{ padding, paddingBottom: 0 }}>
        {titulo}
      </DialogTitle>
      <DialogContent sx={{ padding }}>
        <DialogContentText id={descricaoId}>{descricao}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ padding, paddingTop: 0 }}>
        <Button autoFocus onClick={onCancelar} disabled={desabilitado}>
          Continuar aqui
        </Button>
        <Button
          variant="contained"
          color={destrutivo ? "error" : "secondary"}
          onClick={onConfirmar}
          disabled={desabilitado}
        >
          {rotuloConfirmar}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Aplicacao({
  usuario,
  carregadoEm,
  diaCorrente,
  fuso,
  visaoInicial,
  abaGestaoInicial,
  planilhaInicial,
  abaMovimentacaoInicial,
  seriesIniciais,
  turmasIniciais,
  alunosIniciais,
  frequenciasIniciais,
  saidasIniciais,
  justificativasIniciais,
  liberadoresIniciais,
  configuracoesIniciais,
  resumoInicial,
}: Props) {
  const router = useRouter();
  const ehAdmin = temCapacidade(usuario.papel, "administrar");
  const podeOperar = temCapacidade(usuario.papel, "operar");
  const pedida = visaoValida(visaoInicial);
  const inicial =
    pedida &&
    (pedida !== "gestao" || ehAdmin) &&
    (pedida !== "chamada-parcial" || podeOperar) &&
    (pedida !== "saidas" || configuracoesIniciais.saidaAntecipada)
      ? pedida
      : "painel";
  const [visao, setVisao] = useState<Visao>(inicial);
  const [cadastro, setCadastro] = useState<CadastroGestao>("series");
  const [emConfiguracoes, setEmConfiguracoes] = useState(
    Boolean(abaGestaoInicial || planilhaInicial),
  );
  const [destinoConfiguracoes, setDestinoConfiguracoes] = useState<DestinoConfiguracoes>(
    planilhaInicial ? "planilhas" : "geral",
  );
  const [categoriaExpandida, setCategoriaExpandida] = useState<CategoriaConfiguracoes | null>(
    planilhaInicial ? null : "escola",
  );
  const [gaveta, setGaveta] = useState<EstadoGaveta>(() => ({
    nivel:
      inicial === "gestao" && emConfiguracoes
        ? "configuracoes"
        : inicial === "gestao" || inicial === "relatorios"
          ? inicial
          : "principal",
  }));
  const [destinoRelatorios, setDestinoRelatorios] = useState(() =>
    destinoRelatoriosDe(visaoInicial),
  );
  // A exploração do submenu móvel não altera a visão nem a gaveta permanente.
  const [explorandoRelatorios, setExplorandoRelatorios] = useState(false);
  const relatorioAnterior = useRef(destinoRelatorios);
  const [visitadas, setVisitadas] = useState<Set<Visao>>(() => new Set([inicial]));
  const [series, setSeries] = useState<Serie[]>(seriesIniciais);
  const [turmas, setTurmas] = useState<Turma[]>(turmasIniciais);
  const [alunos, setAlunos] = useState<Aluno[]>(alunosIniciais);
  const [frequencias, setFrequencias] = useState<Frequencia[]>(frequenciasIniciais);
  const [carregandoFrequencias, setCarregandoFrequencias] = useState(false);
  const [erroFrequencias, setErroFrequencias] = useState("");
  const pedidoFrequencias = useRef(0);
  const {
    registros: saidas,
    leitura: leituraSaidasMensais,
    recarregar: recarregarSaidas,
  } = useSaidasMensais(diaCorrente.slice(0, 7), saidasIniciais);
  const [justificativas, setJustificativas] =
    useState<JustificativaConfigurada[]>(justificativasIniciais);
  const [liberadores, setLiberadores] = useState<LiberadorConfigurado[]>(liberadoresIniciais);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(configuracoesIniciais);
  const [resumo, setResumo] = useState<ResumoAcumulado | null>(resumoInicial);
  const [versaoFrequencias, setVersaoFrequencias] = useState(0);
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [alvo, setAlvo] = useState<{ dia: string; turmaId: string } | null>(null);
  const [pendencias, setPendencias] = useState<Visao[]>([]);
  const [configuracaoPendente, setConfiguracaoPendente] = useState(false);
  const [saidaComPendencia, setSaidaComPendencia] = useState(false);
  const [navegacaoPendente, setNavegacaoPendente] = useState<DestinoNavegacao | null>(null);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [sobreAberto, setSobreAberto] = useState(false);
  const gatilhoMenuRef = useRef<HTMLButtonElement | null>(null);
  const origemDialogoRef = useRef<HTMLElement | null>(null);
  const destinoConfirmadoRef = useRef<DestinoNavegacao | null>(null);
  const destinoAguardadoRef = useRef<DestinoNavegacao | null>(null);
  const conteudoRef = useRef<HTMLElement | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const [offline, setOffline] = useState(false);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  // Posição de rolagem de cada painel, para os painéis distantes não a perderem.
  const posicoes = useRef(new Map<Visao, number>());

  useLayoutEffect(() => {
    if (relatorioAnterior.current === destinoRelatorios) return;
    relatorioAnterior.current = destinoRelatorios;
    posicoes.current.delete("relatorios");
    pagerRef.current
      ?.querySelector<HTMLElement>('section[role="group"][aria-label="Relatórios"]')
      ?.scrollTo({ top: 0 });
  }, [destinoRelatorios]);

  // O fechamento do modal e o commit da visão e seção podem ocorrer em qualquer ordem.
  const tentarFocarVisaoAtiva = useCallback(() => {
    const destino = destinoAguardadoRef.current;
    if (
      !destino ||
      visao !== destino.visao ||
      (destino.relatorio !== undefined && destinoRelatorios !== destino.relatorio) ||
      raizRef.current?.hasAttribute("data-gaveta-aberta")
    )
      return;
    destinoAguardadoRef.current = null;
    focarTituloAtivo(conteudoRef.current);
  }, [visao, destinoRelatorios]);
  useLayoutEffect(tentarFocarVisaoAtiva, [tentarFocarVisaoAtiva]);

  function focarDepoisDoFechamento(destino: DestinoNavegacao) {
    destinoAguardadoRef.current = destino;
    tentarFocarVisaoAtiva();
  }

  function aoFecharMenu(destino: DestinoFocoMenu) {
    setExplorandoRelatorios(false);
    if (typeof destino === "object") focarDepoisDoFechamento(destino);
    else if (destino === "largura") {
      const opcao = explorandoRelatorios
        ? raizRef.current?.querySelector<HTMLElement>(
            'aside[aria-label="Navegação do aplicativo"] nav [aria-current="page"]',
          )
        : null;
      if (opcao?.getClientRects().length) opcao.focus({ preventScroll: true });
      else focarTituloAtivo(conteudoRef.current);
    } else if (destino === "dialogo") {
      tentarFocarVisaoAtiva();
    }
  }

  const itemFinal = useMemo(
    () => ITENS_FIM.find((item) => item.visao === (ehAdmin ? "gestao" : "alunos")),
    [ehAdmin],
  );
  const itens = useMemo<ItemNav[]>(() => {
    const lista = [...ITENS_INICIAIS];
    if (podeOperar) lista.splice(2, 0, ITEM_CHAMADA_PARCIAL);
    if (configuracoes.saidaAntecipada) lista.push(ITEM_SAIDAS);
    lista.push(ITEM_RELATORIOS);
    if (ehAdmin) {
      for (const item of ITENS_FIM) lista.push(item);
    } else if (itemFinal) {
      lista.push(itemFinal);
    }
    return lista;
  }, [configuracoes.saidaAntecipada, ehAdmin, itemFinal, podeOperar]);
  const indiceAtivo = itens.findIndex((item) => item.visao === visao);
  const tituloAtual = itens.find((item) => item.visao === visao)?.rotulo ?? "FrequenciApp";

  const rotuloTurma = useCallback(
    (id: string) => turmas.find((t) => t.id === id)?.rotulo ?? "",
    [turmas],
  );

  const recarregarAlunos = useCallback(async () => {
    const dados = await pedir<{ alunos: Aluno[] }>("/api/alunos");
    setAlunos(dados.alunos);
  }, []);

  const recarregarEscopo = useCallback(async () => {
    const dados = await pedir<{ turmas: Turma[] }>("/api/turmas");
    setTurmas(dados.turmas);
  }, []);

  const recarregarConfiguracoes = useCallback(async () => {
    const dados = await pedir<{ configuracoes: Configuracoes }>("/api/configuracoes");
    setConfiguracoes(dados.configuracoes);
  }, []);

  const recarregarFrequencias = useCallback(
    async (novoMes: string) => {
      const pedido = ++pedidoFrequencias.current;
      setMes(novoMes);
      setCarregandoFrequencias(true);
      setErroFrequencias("");
      try {
        const dados = await pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?mes=${novoMes}`);
        if (pedido !== pedidoFrequencias.current) return;
        setFrequencias(dados.frequencias);
        setVersaoFrequencias((valor) => valor + 1);
        try {
          const resumoDados = await pedir<{ resumo: ResumoAcumulado }>(
            `/api/frequencias/resumo?ate=${diaCorrente}`,
          );
          if (pedido === pedidoFrequencias.current) setResumo(resumoDados.resumo);
        } catch {
          // O acumulado é complementar: a chamada segue sem ele.
        }
      } catch (excecao) {
        if (pedido !== pedidoFrequencias.current) return;
        setErroFrequencias("Não foi possível carregar as frequências deste mês.");
        avisarErro(excecao, {
          contexto: "Não foi possível atualizar as frequências.",
          descricao: "As informações na tela podem estar desatualizadas.",
        });
      } finally {
        if (pedido === pedidoFrequencias.current) setCarregandoFrequencias(false);
      }
    },
    [diaCorrente],
  );

  // Troca de mês nos relatórios recarrega frequências e saídas juntas.
  const recarregarMes = useCallback(
    async (novoMes: string) => {
      try {
        await Promise.all([recarregarFrequencias(novoMes), recarregarSaidas(novoMes)]);
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível carregar o mês." });
      }
    },
    [recarregarFrequencias, recarregarSaidas],
  );

  const recarregarJustificativas = useCallback(async () => {
    const dados = await pedir<{ justificativas: JustificativaConfigurada[] }>(
      "/api/justificativas",
    );
    setJustificativas(dados.justificativas);
  }, []);

  const recarregarLiberadores = useCallback(async () => {
    const dados = await pedir<{ liberadores: LiberadorConfigurado[] }>("/api/liberadores");
    setLiberadores(dados.liberadores);
  }, []);

  // Guarda a rolagem uma única vez, ao sair da visão. Ler em cada evento de
  // rolagem custa layout e aparece no perfil de quadros do celular.
  const guardarRolagemAtual = useCallback(() => {
    const item = itens.find((candidato) => candidato.visao === visao);
    if (!item) return;
    const painel = pagerRef.current?.querySelector<HTMLElement>(`[aria-label="${item.rotulo}"]`);
    if (painel) posicoes.current.set(visao, painel.scrollTop);
  }, [itens, visao]);

  const ativarVisao = useCallback(
    (proxima: Visao) => {
      if (!itens.some((item) => item.visao === proxima)) return;
      guardarRolagemAtual();
      setVisao(proxima);
      if (proxima === "gestao") {
        setEmConfiguracoes(false);
        setGaveta({ nivel: "gestao" });
      } else {
        setGaveta({ nivel: proxima === "relatorios" ? "relatorios" : "principal" });
      }
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
    },
    [guardarRolagemAtual, itens],
  );
  // A Chamada Parcial guarda o rascunho na própria visão; a edição de horários, em Gestão.
  const visaoComRascunho = useCallback(
    (alvo: Visao) =>
      (alvo === "chamada-parcial" && pendencias.includes("chamada-parcial")) ||
      (alvo === "gestao" && pendencias.includes("horarios")) ||
      (alvo === "gestao" && configuracaoPendente),
    [pendencias, configuracaoPendente],
  );
  const trocarVisao = useCallback(
    (proxima: Visao) => {
      if (!itens.some((item) => item.visao === proxima) || proxima === visao) return;
      if (visaoComRascunho(visao)) {
        setNavegacaoPendente({ visao: proxima });
        return;
      }
      ativarVisao(proxima);
    },
    [ativarVisao, itens, visao, visaoComRascunho],
  );
  function navegarPeloMenu(proxima: Visao, fecharMenu: FecharMenu) {
    const pedeConferencia = visaoComRascunho(visao) && proxima !== visao;
    if (pedeConferencia) {
      origemDialogoRef.current = gatilhoMenuRef.current;
      fecharMenu("dialogo");
      trocarVisao(proxima);
      return;
    }
    fecharMenu({ visao: proxima });
    startTransition(() => trocarVisao(proxima));
  }

  function abrirNivelGestao(fecharMenu?: FecharMenu) {
    if (visao !== "gestao" && visaoComRascunho(visao)) {
      origemDialogoRef.current = fecharMenu
        ? gatilhoMenuRef.current
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      fecharMenu?.("dialogo");
      trocarVisao("gestao");
      return;
    }
    if (visao !== "gestao") ativarVisao("gestao");
    setGaveta({ nivel: "gestao", foco: "voltar", sentido: "entrar" });
  }

  function abrirNivelRelatorios(fecharMenu?: FecharMenu) {
    if (fecharMenu && visao !== "relatorios") {
      setExplorandoRelatorios(true);
      return;
    }
    if (visao !== "relatorios" && visaoComRascunho(visao)) {
      origemDialogoRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      trocarVisao("relatorios");
      return;
    }
    if (visao !== "relatorios") ativarVisao("relatorios");
    setGaveta({ nivel: "relatorios", foco: "voltar", sentido: "entrar" });
  }

  function escolherRelatorio(destino: DestinoRelatorios, fecharMenu?: FecharMenu) {
    const proxima: DestinoNavegacao = { visao: "relatorios", relatorio: destino };
    if (visao !== "relatorios" && visaoComRascunho(visao)) {
      origemDialogoRef.current = gatilhoMenuRef.current;
      fecharMenu?.("dialogo");
      setNavegacaoPendente(proxima);
      return;
    }
    fecharMenu?.(proxima);
    if (visao === "relatorios" && destinoRelatorios === destino) return;
    startTransition(() => {
      if (visao !== "relatorios") ativarVisao("relatorios");
      setDestinoRelatorios(destino);
    });
  }

  function rolarGestaoAoTopo() {
    pagerRef.current?.querySelector<HTMLElement>('[aria-label="Gestão"]')?.scrollTo({ top: 0 });
    posicoes.current.delete("gestao");
  }

  function abrirNivelConfiguracoes() {
    setEmConfiguracoes(true);
    setCategoriaExpandida(categoriaDe(destinoConfiguracoes).valor);
    setGaveta({ nivel: "configuracoes", foco: "voltar", sentido: "entrar" });
    rolarGestaoAoTopo();
  }

  function devolverFocoDoDialogo() {
    const origem = origemDialogoRef.current;
    // A opção do menu pode ter sido desmontada ou escondida pela mudança de largura.
    if (origem?.isConnected && origem.getClientRects().length > 0) origem.focus();
    else conteudoRef.current?.focus();
  }
  const registrarPendenciasChamada = useCallback((novas: "chamada"[]) => {
    setPendencias((atuais) => [...atuais.filter((item) => item !== "chamada"), ...novas]);
  }, []);
  const registrarPendenciaParcial = useCallback((pendente: boolean) => {
    setPendencias((atuais) => {
      const restantes = atuais.filter((item) => item !== "chamada-parcial");
      return pendente ? [...restantes, "chamada-parcial"] : restantes;
    });
  }, []);
  const registrarPendenciaHorarios = useCallback((pendente: boolean) => {
    setPendencias((atuais) => {
      const semHorarios = atuais.filter((item) => item !== "horarios");
      return pendente ? [...semHorarios, "horarios"] : semHorarios;
    });
  }, []);
  useEffect(() => {
    const indice = itens.findIndex((item) => item.visao === visao);
    if (indice < 0) return;
    const salvo = posicoes.current.get(visao);
    if (salvo === undefined) return;
    const rotulo = itens[indice]?.rotulo;
    if (!rotulo) return;
    const quadro = window.requestAnimationFrame(() => {
      const painel = pagerRef.current?.querySelector(`[aria-label="${rotulo}"]`);
      if (painel instanceof HTMLElement && painel.scrollTop !== salvo) painel.scrollTop = salvo;
    });
    return () => window.cancelAnimationFrame(quadro);
  }, [itens, visao]);

  // Monta as áreas depois da primeira pintura: nenhuma tela pesada deve
  // montar junto da primeira visão.
  useEffect(() => {
    const aquecer = () => {
      startTransition(() => {
        setVisitadas((atuais) => {
          const proximas = new Set(atuais);
          for (const item of itens) proximas.add(item.visao);
          return proximas.size === atuais.size ? atuais : proximas;
        });
      });
    };
    const janela = window as Window & {
      requestIdleCallback?: (retorno: () => void, opcoes?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (janela.requestIdleCallback && janela.cancelIdleCallback) {
      const id = janela.requestIdleCallback(aquecer, { timeout: 3000 });
      return () => janela.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(aquecer, 1500);
    return () => window.clearTimeout(id);
  }, [itens]);

  // A lista de itens muda quando a área de saídas é ligada ou desligada. A
  // visão ativa volta para um item válido sem perder o estado da chamada.
  useEffect(() => {
    if (itens.length === 0) return;
    if (itens.some((item) => item.visao === visao)) return;
    const alvo = itens[Math.min(Math.max(indiceAtivo, 0), itens.length - 1)];
    if (!alvo || alvo.visao === visao) return;
    const quadro = window.requestAnimationFrame(() => trocarVisao(alvo.visao));
    return () => window.cancelAnimationFrame(quadro);
  }, [itens, visao, trocarVisao, indiceAtivo]);

  function abrirFrequencia(dia: string, turmaId: string) {
    setAlvo({ dia, turmaId });
    trocarVisao("chamada");
    requestAnimationFrame(() => {
      const painel = pagerRef.current?.querySelector('[aria-label="Chamada"]');
      if (painel instanceof HTMLElement) painel.scrollTo({ top: 0 });
    });
  }

  useEffect(() => {
    const item = itens.find((i) => i.visao === visao);
    document.title = item ? `${item.rotulo} · FrequenciApp` : "FrequenciApp";
  }, [itens, visao]);

  // O endereço acompanha a visão sem criar navegação de página por visão.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (visao === "painel") url.searchParams.delete("visao");
    else url.searchParams.set("visao", visao);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [visao]);

  useEffect(() => {
    function avisarSaida(evento: BeforeUnloadEvent) {
      if (pendencias.length > 0 || configuracaoPendente) {
        evento.preventDefault();
        evento.returnValue = "";
      }
    }
    function aoFicarOffline() {
      setOffline(true);
    }
    function aoFicarOnline() {
      setOffline(false);
    }
    function aoExpirarSessao() {
      try {
        window.sessionStorage.setItem(CHAVE_AVISO_ENTRADA, "sessao_expirada");
      } catch {
        // Sem armazenamento: a tela de entrada abre sem o aviso.
      }
      void expurgarBiNoLogout().catch(() => undefined);
      router.refresh();
    }
    window.addEventListener("beforeunload", avisarSaida);
    window.addEventListener("offline", aoFicarOffline);
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("sessao-expirada", aoExpirarSessao);
    return () => {
      window.removeEventListener("beforeunload", avisarSaida);
      window.removeEventListener("offline", aoFicarOffline);
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("sessao-expirada", aoExpirarSessao);
    };
  }, [pendencias, configuracaoPendente, router]);

  const { executando: saindo, executar: executarSaida } = useAcaoUnica(async () => {
    try {
      await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível sair. Tente novamente." });
      return;
    }
    try {
      await expurgarBiNoLogout();
    } catch {
      // A sessão encerra mesmo quando o navegador bloqueia o armazenamento local.
    }
    avisarSucesso("Sessão encerrada.");
    router.refresh();
  });

  function sair() {
    if (pendencias.length > 0 || configuracaoPendente) {
      setSaidaComPendencia(true);
      return;
    }
    void executarSaida();
  }

  function confirmarSaida() {
    setSaidaComPendencia(false);
    void executarSaida();
  }

  function renderizarVisao(alvoVisao: Visao, ativo: boolean) {
    return (
      <>
        {alvoVisao === "painel" && (
          <VistaPainel
            ativo={ativo}
            diaCorrente={diaCorrente}
            fuso={fuso}
            mes={mes}
            series={series}
            turmas={turmas}
            alunos={alunos}
            frequencias={frequencias}
            saidas={saidas}
            configuracoes={configuracoes}
            onRecarregar={recarregarMes}
            onRecarregarConfiguracoes={recarregarConfiguracoes}
          />
        )}
        {alvoVisao === "chamada" && (
          <VistaFrequencia
            usuario={usuario}
            ativo={ativo}
            turmas={turmas}
            alunos={alunos}
            diaCorrente={diaCorrente}
            fuso={fuso}
            alvo={alvo}
            configuracoes={configuracoes}
            catalogoJustificativas={justificativas}
            versaoFrequencias={versaoFrequencias}
            onFrequenciasMudaram={recarregarFrequencias}
            onPendencia={registrarPendenciasChamada}
            onAbrirGestao={ehAdmin ? () => trocarVisao("gestao") : undefined}
          />
        )}
        {alvoVisao === "chamada-parcial" && podeOperar && (
          <VistaChamadaParcial
            series={series}
            turmas={turmas}
            alunos={alunos}
            diaInicial={diaCorrente}
            ativa={ativo}
            fuso={fuso}
            feriados={configuracoes.feriados}
            mostrarSaidas={configuracoes.saidaAntecipada}
            justificativas={justificativas}
            onFrequenciasMudaram={() => recarregarFrequencias(mes)}
            onPendencia={registrarPendenciaParcial}
            onAbrirChamada={abrirFrequencia}
          />
        )}
        {alvoVisao === "horarios" && (
          <VistaHorarios
            turmas={turmas}
            diaCorrente={diaCorrente}
            fuso={fuso}
            editavel={false}
            onMudanca={recarregarEscopo}
          />
        )}
        {alvoVisao === "saidas" && configuracoes.saidaAntecipada && (
          <VistaMovimentacoes
            abaInicial={abaMovimentacaoInicial}
            diaCorrente={diaCorrente}
            fuso={fuso}
            mes={mes}
            turmas={turmas}
            alunos={alunos}
            catalogoJustificativas={justificativas}
            liberadores={liberadores}
            saidas={saidas}
            leituraMensal={leituraSaidasMensais}
            onSaidasMudaram={recarregarSaidas}
            ativo={ativo}
            onAbrirGestao={ehAdmin ? () => trocarVisao("gestao") : undefined}
          />
        )}
        {alvoVisao === "relatorios" && (
          <VistaRelatorios
            ativo={ativo}
            carregando={carregandoFrequencias}
            erro={erroFrequencias}
            destino={destinoRelatorios}
            mes={mes}
            mesCorrente={diaCorrente.slice(0, 7)}
            diaCorrente={diaCorrente}
            fuso={fuso}
            series={series}
            turmas={turmas}
            alunos={alunos}
            frequencias={frequencias}
            saidas={saidas}
            resumo={resumo}
            versao={versaoFrequencias}
            bloqueado={pendencias.includes("chamada")}
            rotuloTurma={rotuloTurma}
            onMes={recarregarMes}
            onAbrir={abrirFrequencia}
            onRecarregar={recarregarFrequencias}
          />
        )}
        {alvoVisao === "alunos" && (
          <VistaAlunos
            alunos={alunos}
            turmas={turmas}
            fuso={fuso}
            onAtualizar={async () => {
              await Promise.all([recarregarAlunos(), recarregarEscopo()]);
            }}
          />
        )}
        {alvoVisao === "gestao" && ehAdmin && (
          <VistaGestao
            planilhaInicial={planilhaInicial}
            destino={emConfiguracoes ? "configuracoes" : cadastro}
            destinoConfiguracoes={destinoConfiguracoes}
            usuarioId={usuario.id}
            series={series}
            turmas={turmas}
            alunos={alunos}
            configuracoes={configuracoes}
            diaCorrente={diaCorrente}
            fuso={fuso}
            justificativas={justificativas}
            liberadores={liberadores}
            onSeriesMudaram={async () => {
              const dados = await pedir<{ series: Serie[] }>("/api/series");
              setSeries(dados.series);
            }}
            onTurmasMudaram={async () => {
              await recarregarEscopo();
              const dados = await pedir<{ series: Serie[] }>("/api/series");
              setSeries(dados.series);
            }}
            onAlunosMudaram={recarregarAlunos}
            onConfiguracoesMudaram={setConfiguracoes}
            onJustificativasMudaram={recarregarJustificativas}
            onLiberadoresMudaram={recarregarLiberadores}
            onHorariosMudaram={recarregarEscopo}
            onPendenciaHorarios={registrarPendenciaHorarios}
            onPendenciaConfiguracoes={setConfiguracaoPendente}
            onAbrirSaidas={() => trocarVisao("saidas")}
            onAbrirParcial={() => trocarVisao("chamada-parcial")}
          />
        )}
      </>
    );
  }

  function abrirAcaoConta(acao: AcaoConta, gatilho: HTMLElement | null, fecharMenu?: FecharMenu) {
    origemDialogoRef.current = fecharMenu ? gatilhoMenuRef.current : gatilho;
    if (acao === "sair") {
      fecharMenu?.(pendencias.length > 0 || configuracaoPendente ? "dialogo" : "gatilho");
      void sair();
      return;
    }
    fecharMenu?.("dialogo");
    if (acao === "notificacoes") setNotificacoesAbertas(true);
    else if (acao === "senha") setSenhaAberta(true);
    else setSobreAberto(true);
  }

  function renderizarMenu(movel: boolean, fecharMenu?: FecharMenu) {
    const estado: EstadoGaveta =
      movel && explorandoRelatorios
        ? { nivel: "relatorios", foco: "voltar", sentido: "entrar" }
        : gaveta;
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          flex: 1,
          paddingTop: movel ? "env(safe-area-inset-top)" : 0,
          paddingBottom: movel ? "env(safe-area-inset-bottom)" : 0,
          paddingLeft: movel ? "env(safe-area-inset-left)" : 0,
        }}
      >
        <Toolbar sx={{ flexShrink: 0, gap: 1.5, px: { xs: 2, md: 2.5 } }}>
          <Box sx={{ display: "flex", alignItems: "center", ml: movel ? 0 : "15px" }}>
            <Logotipo tamanho={26} alt="" />
          </Box>
          <Typography
            variant="subtitle1"
            noWrap
            sx={{ minWidth: 0, flex: 1, fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}
          >
            FrequenciApp
          </Typography>
          {movel && (
            <IconButton
              aria-label="Fechar menu"
              onClick={() => fecharMenu?.()}
              sx={{ width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque }}
            >
              <CloseRoundedIcon />
            </IconButton>
          )}
        </Toolbar>
        <Divider />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            px: 1.5,
            py: 1.5,
          }}
        >
          <ListaGaveta estado={estado} movel={movel}>
            {estado.nivel === "relatorios" ? (
              <OpcoesRelatorios
                atual={visao === "relatorios" ? destinoRelatorios : null}
                onEscolher={(destino) => escolherRelatorio(destino, fecharMenu)}
                onVoltar={() => {
                  setExplorandoRelatorios(false);
                  setGaveta({ nivel: "principal", foco: "relatorios", sentido: "voltar" });
                }}
              />
            ) : ehAdmin && estado.nivel === "gestao" ? (
              <OpcoesGestao
                atual={emConfiguracoes ? "configuracoes" : cadastro}
                pendente={visaoComRascunho("gestao")}
                onCadastro={(destino) => {
                  rolarGestaoAoTopo();
                  setCadastro(destino);
                  setEmConfiguracoes(false);
                  fecharMenu?.("titulo");
                }}
                onConfiguracoes={abrirNivelConfiguracoes}
                onVoltar={() =>
                  setGaveta({ nivel: "principal", foco: "gestao", sentido: "voltar" })
                }
              />
            ) : ehAdmin && estado.nivel === "configuracoes" ? (
              <OpcoesConfiguracoes
                atual={destinoConfiguracoes}
                expandida={categoriaExpandida}
                onExpandir={setCategoriaExpandida}
                onEscolher={(destino) => {
                  rolarGestaoAoTopo();
                  setDestinoConfiguracoes(destino);
                  fecharMenu?.("titulo");
                }}
                onVoltar={() => {
                  rolarGestaoAoTopo();
                  setEmConfiguracoes(false);
                  setGaveta({ nivel: "gestao", foco: "configuracoes", sentido: "voltar" });
                }}
              />
            ) : (
              <>
                {itens.map((item) => (
                  <ListItem key={item.visao} disablePadding>
                    <OpcaoGaveta
                      rotulo={item.rotulo}
                      icone={item.icone}
                      atual={visao === item.visao}
                      foco={
                        item.visao === "gestao" || item.visao === "relatorios"
                          ? item.visao
                          : undefined
                      }
                      indicador={
                        item.visao === "gestao" || item.visao === "relatorios"
                          ? ChevronRightRoundedIcon
                          : undefined
                      }
                      pendente={
                        pendencias.includes(item.visao) ||
                        (item.visao === "gestao" && visaoComRascunho("gestao"))
                      }
                      onEscolher={() => {
                        if (item.visao === "gestao") abrirNivelGestao(fecharMenu);
                        else if (item.visao === "relatorios") abrirNivelRelatorios(fecharMenu);
                        else if (fecharMenu) navegarPeloMenu(item.visao, fecharMenu);
                        else trocarVisao(item.visao);
                      }}
                    />
                  </ListItem>
                ))}
              </>
            )}
            {(usuario.papel === "ADMIN" || usuario.papel === "COORDENACAO") && (
              <ListItem disablePadding>
                <OpcaoGaveta
                  rotulo="FrequenciBI"
                  icone={InsightsRoundedIcon}
                  novaAba={{ href: "/bi", rotulo: "FrequenciBI, nova aba" }}
                />
              </ListItem>
            )}
          </ListaGaveta>
          <Divider sx={{ mt: "auto" }} />
          <Box sx={{ pt: 1 }}>
            {movel && (
              <Box
                sx={{
                  display: "none",
                  alignItems: "center",
                  px: 0.5,
                  [TELA_ESTREITA]: { display: "flex" },
                }}
              >
                <BotaoAtualizar variante="texto" />
                <Typography variant="body2" aria-hidden="true">
                  Atualizar tela
                </Typography>
              </Box>
            )}
            <MenuConta
              usuario={usuario}
              movel={movel}
              saindo={saindo}
              onAcao={(acao, gatilho) => abrirAcaoConta(acao, gatilho, fecharMenu)}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <ProvedorAtualizacao ativo={visao} atualizadoEmInicial={carregadoEm}>
      <>
        <Box
          ref={raizRef}
          data-raiz="aplicacao"
          sx={{
            display: "flex",
            width: "100%",
            height: "100dvh",
            overflow: "hidden",
            bgcolor: "background.default",
            boxSizing: "border-box",
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          <Box
            component="a"
            href="#conteudo"
            sx={{
              ...VISUALMENTE_OCULTO,
              "&:focus": {
                position: "fixed",
                top: 8,
                left: 8,
                zIndex: 1500,
                width: "auto",
                height: "auto",
                padding: 1.5,
                margin: 0,
                overflow: "visible",
                clip: "auto",
                whiteSpace: "normal",
                bgcolor: "background.paper",
                color: "text.primary",
                borderRadius: 1,
                boxShadow: 3,
              },
            }}
          >
            Pular para o conteúdo
          </Box>

          <Drawer
            variant="permanent"
            open
            slotProps={{
              paper: {
                component: "aside",
                "aria-label": "Navegação do aplicativo",
                sx: {
                  display: { xs: "none", md: "flex" },
                  visibility: { xs: "hidden", md: "visible" },
                  pointerEvents: { xs: "none", md: "auto" },
                },
              },
            }}
            sx={{
              display: { xs: "none", md: "block" },
              visibility: { xs: "hidden", md: "visible" },
              pointerEvents: { xs: "none", md: "auto" },
              width: TOKENS_LAYOUT.gaveta,
              flexShrink: 0,
            }}
          >
            {renderizarMenu(false)}
          </Drawer>

          <AppBar
            position="fixed"
            sx={{
              width: {
                xs: "100%",
                md: `calc(100% - ${TOKENS_LAYOUT.gaveta}px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))`,
              },
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingLeft: { xs: "env(safe-area-inset-left, 0px)", md: 0 },
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
          >
            <Toolbar
              disableGutters
              sx={{
                boxSizing: "border-box",
                width: "100%",
                maxWidth: { md: LARGURAS_CONTEUDO[larguraDaVisao(visao)] },
                px: { ...ESPACAMENTO_LATERAL_CONTEUDO, xs: 1 },
                mx: "auto",
                gap: { xs: 0.5, sm: 1.5 },
              }}
            >
              <Box sx={{ display: { xs: "flex", md: "none" }, flexShrink: 0 }}>
                <MenuMovel
                  raizRef={raizRef}
                  gatilhoRef={gatilhoMenuRef}
                  conteudoRef={conteudoRef}
                  pendente={pendencias.length > 0 || configuracaoPendente}
                  onAbrir={() => {
                    destinoAguardadoRef.current = null;
                  }}
                  onFechado={aoFecharMenu}
                  renderizarConteudo={(fechar) => renderizarMenu(true, fechar)}
                />
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
                <Typography
                  variant="subtitle1"
                  noWrap
                  component="p"
                  sx={{
                    display: { xs: "block", md: "none" },
                    minWidth: 0,
                    flex: 1,
                    fontSize: { xs: 16, sm: 18 },
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  FrequenciApp
                </Typography>
                <Typography
                  variant="h6"
                  noWrap
                  component="p"
                  sx={{ display: { xs: "none", md: "block" }, minWidth: 0, flex: 1 }}
                >
                  {tituloAtual}
                </Typography>
              </Box>
              <Box
                sx={{ display: "inline-flex", flexShrink: 0, [TELA_ESTREITA]: { display: "none" } }}
              >
                <BotaoAtualizar variante="texto" />
              </Box>
              <SeletorTema />
              <BotaoIcone
                rotulo="Configurar notificações"
                icone={<NotificationsRoundedIcon />}
                variante="texto"
                onClick={(evento) => {
                  origemDialogoRef.current = evento.currentTarget;
                  setNotificacoesAbertas(true);
                }}
                sx={{ width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque }}
              />
            </Toolbar>
          </AppBar>

          <Box
            ref={conteudoRef}
            component="main"
            id="conteudo"
            tabIndex={-1}
            data-visao={visao}
            sx={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              boxSizing: "border-box",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
              outline: "none",
            }}
          >
            <Toolbar />
            {offline ? (
              <Alert
                severity="warning"
                role="status"
                icon={<WifiOffRoundedIcon fontSize="small" />}
                sx={{ borderRadius: 0, flexShrink: 0, py: 0.5 }}
              >
                Sem conexão. As marcações continuam na tela e precisam de internet para salvar.
              </Alert>
            ) : null}
            <Box
              ref={pagerRef}
              data-pager="principal"
              sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}
            >
              {itens.map((item, indice) => {
                const ativo = item.visao === visao;
                const distante = Math.abs(indice - indiceAtivo) > 1;
                if (!ativo && !visitadas.has(item.visao)) return null;
                return (
                  <Box
                    key={item.visao}
                    component="section"
                    role="group"
                    aria-label={item.rotulo}
                    aria-hidden={!ativo}
                    inert={!ativo}
                    data-distante={distante ? "true" : undefined}
                    hidden={!ativo}
                    sx={{
                      height: "100%",
                      width: "100%",
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      "@media (min-width:1024px)": { scrollbarGutter: "stable both-edges" },
                      ...(distante
                        ? {
                            contentVisibility: "auto",
                            contain: "layout paint style",
                            containIntrinsicSize: "auto 800px",
                          }
                        : {}),
                    }}
                  >
                    <ProvedorVisibilidadeGraficos visivel={ativo}>
                      <LayoutConteudo largura={larguraDaVisao(item.visao)}>
                        {renderizarVisao(item.visao, ativo)}
                      </LayoutConteudo>
                    </ProvedorVisibilidadeGraficos>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        <DialogoPendencia
          aberto={saidaComPendencia}
          titulo="Há alterações não salvas"
          descricao="As alterações não salvas serão perdidas."
          rotuloConfirmar="Sair mesmo assim"
          destrutivo
          desabilitado={saindo}
          onCancelar={() => setSaidaComPendencia(false)}
          onConfirmar={confirmarSaida}
          onFechado={devolverFocoDoDialogo}
        />

        <DialogoPendencia
          aberto={navegacaoPendente !== null}
          titulo={
            visao === "gestao"
              ? configuracaoPendente
                ? "Há configurações não salvas"
                : "Há alterações não salvas nos Horários"
              : "Há alterações não salvas na Chamada Parcial"
          }
          descricao="As alterações continuam pendentes. Ao voltar, será possível salvá-las."
          rotuloConfirmar="Mudar de tela"
          onCancelar={() => setNavegacaoPendente(null)}
          onConfirmar={() => {
            const proxima = navegacaoPendente;
            setNavegacaoPendente(null);
            if (!proxima) return;
            destinoConfirmadoRef.current = proxima;
            startTransition(() => {
              ativarVisao(proxima.visao);
              if (proxima.relatorio !== undefined) setDestinoRelatorios(proxima.relatorio);
            });
          }}
          onFechado={() => {
            const destino = destinoConfirmadoRef.current;
            destinoConfirmadoRef.current = null;
            if (destino) focarDepoisDoFechamento(destino);
            else devolverFocoDoDialogo();
          }}
        />

        <DialogoSenha
          aberto={senhaAberta}
          onAbrir={setSenhaAberta}
          onDevolverFoco={devolverFocoDoDialogo}
        />
        <DialogoNotificacoes
          aberto={notificacoesAbertas}
          onAbrir={setNotificacoesAbertas}
          onDevolverFoco={devolverFocoDoDialogo}
        />
        <DialogoSobre
          aberto={sobreAberto}
          onAbrir={setSobreAberto}
          onDevolverFoco={devolverFocoDoDialogo}
        />
        <RegistroPwa />
      </>
    </ProvedorAtualizacao>
  );
}
