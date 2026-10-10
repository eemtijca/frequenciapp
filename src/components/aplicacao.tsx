"use client";

// Navegação lateral compartilhada entre desktop e menu móvel, com estado preservado.
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  Bell,
  CalendarDays,
  ChartPie,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  KeyRound,
  LogOut,
  Menu,
  Settings2,
  Table2,
  UserRound,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { diasDoMes } from "@/domain/frequencia";
import { rotuloDePapel, temCapacidade, type Identidade } from "@/domain/usuarios";
import { pedir } from "@/lib/api-cliente";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SeletorTema } from "@/components/ui/seletor-tema";
import VistaFrequencia from "@/components/frequencia/vista-frequencia";
import VistaChamadaParcial from "@/components/frequencia-parcial/vista-frequencia-parcial";
import VistaHorarios from "@/components/horarios/vista-horarios";
import VistaPainel from "@/components/painel/vista-painel";
import VistaMovimentacoes from "@/components/saidas/vista-movimentacoes";
import VistaRelatorios, { type AbaRelatorio } from "@/components/relatorios/vista-relatorios";
import VistaAlunos from "@/components/alunos/vista-alunos";
import VistaGestao from "@/components/gestao/vista-gestao";
import DialogoSenha from "@/components/conta/dialogo-senha";
import DialogoNotificacoes from "@/components/conta/dialogo-notificacoes";
import RegistroPwa from "@/components/pwa/registro-pwa";

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

function visaoValida(valor: string | undefined): Visao | null {
  // Valores antigos do manifest e de links continuam abrindo a área certa.
  if (valor === "frequencia") return "chamada";
  if (valor === "historico" || valor === "grade") return "relatorios";
  return VISOES.find((visao) => visao === valor) ?? null;
}

function abaRelatoriosDe(valor: string | undefined): AbaRelatorio | undefined {
  if (valor === "historico") return "historico";
  if (valor === "grade") return "grade";
  return undefined;
}

interface ItemNav {
  visao: Visao;
  rotulo: string;
  icone: typeof ClipboardCheck;
}

const ITENS_INICIAIS: ItemNav[] = [
  { visao: "painel", rotulo: "Painel", icone: ChartPie },
  { visao: "chamada", rotulo: "Chamada", icone: ClipboardCheck },
  { visao: "horarios", rotulo: "Horários", icone: CalendarDays },
];

const ITEM_SAIDAS: ItemNav = { visao: "saidas", rotulo: "Saídas e entradas", icone: DoorOpen };
const ITEM_RELATORIOS: ItemNav = { visao: "relatorios", rotulo: "Relatórios", icone: Table2 };
const ITEM_CHAMADA_PARCIAL: ItemNav = {
  visao: "chamada-parcial",
  rotulo: "Chamada Parcial",
  icone: ClipboardList,
};

const ITENS_FIM: ItemNav[] = [
  { visao: "alunos", rotulo: "Alunos", icone: Users },
  { visao: "gestao", rotulo: "Gestão", icone: Settings2 },
];

const LARGURAS: Record<Visao, string> = {
  painel: "max-w-5xl",
  chamada: "max-w-2xl xl:max-w-6xl",
  horarios: "max-w-6xl",
  "chamada-parcial": "max-w-4xl",
  saidas: "max-w-5xl",
  relatorios: "max-w-7xl",
  alunos: "max-w-5xl",
  gestao: "max-w-6xl",
};

interface ItemNavegacaoProps {
  item: ItemNav;
  ativo: boolean;
  pendente: boolean;
  /**
   * Indicador animado entre itens; sem ele, a marca é estática. A gaveta do
   * celular fecha ao trocar de tela, então lá a animação só custaria medições.
   */
  indicador?: string;
  onTrocar: (visao: Visao) => void;
}

function ItemNavegacao({ item, ativo, pendente, indicador, onTrocar }: ItemNavegacaoProps) {
  const Icone = item.icone;
  const semMovimento = (useReducedMotion() ?? false) || indicador === undefined;
  return (
    <button
      type="button"
      aria-current={ativo ? "page" : undefined}
      onClick={() => onTrocar(item.visao)}
      className={cn(
        "pressionavel focus-visible:ring-ring relative flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-2xl px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
        ativo ? "vidro-selecionado" : "vidro-discreto text-muted-foreground",
      )}
    >
      {ativo &&
        (semMovimento ? (
          <span
            aria-hidden="true"
            className="bg-primary/15 absolute inset-y-1 left-0 w-1 rounded-full"
          />
        ) : (
          <motion.span
            layoutId={indicador}
            aria-hidden="true"
            className="bg-primary/15 absolute inset-y-1 left-0 w-1 rounded-full"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        ))}
      <Icone size={20} strokeWidth={ativo ? 2 : 1.7} aria-hidden="true" className="shrink-0" />
      <span className="text-left leading-tight">{item.rotulo}</span>
      {pendente && (
        <span
          aria-label="Alterações não salvas"
          className="bg-falta ml-auto size-1.5 shrink-0 rounded-full"
        />
      )}
    </button>
  );
}

type DestinoFocoMenu = "gatilho" | "conteudo" | "dialogo";
type FecharMenu = (destino?: DestinoFocoMenu) => void;

interface MenuMovelProps {
  /** Contêiner do app, que recebe a marca de gaveta aberta (ver `globals.css`). */
  raizRef: React.RefObject<HTMLDivElement | null>;
  gatilhoRef: React.RefObject<HTMLButtonElement | null>;
  conteudoRef: React.RefObject<HTMLElement | null>;
  pendente: boolean;
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
  renderizarConteudo,
}: MenuMovelProps) {
  const [aberto, setAberto] = useState(false);
  // Para onde o foco volta quando a gaveta fecha; em estado, porque o fechamento
  // é passado ao conteúdo durante a renderização.
  const [destinoFoco, setDestinoFoco] = useState<DestinoFocoMenu>("gatilho");
  const menuRef = useRef<HTMLDivElement | null>(null);

  // A mudança de largura encerra também o modal, liberando o fundo e o foco.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function aoMudarLargura() {
      if (!desktop.matches) return;
      setDestinoFoco("conteudo");
      setAberto(false);
    }
    desktop.addEventListener("change", aoMudarLargura);
    return () => desktop.removeEventListener("change", aoMudarLargura);
  }, []);

  const fechar = useCallback<FecharMenu>((destino = "gatilho") => {
    setDestinoFoco(destino);
    setAberto(false);
  }, []);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        if (proximo) {
          // Antes de o Radix bloquear o body: a marca corta a herança do bloqueio.
          raizRef.current?.setAttribute("data-gaveta-aberta", "");
          setDestinoFoco("gatilho");
        }
        setAberto(proximo);
      }}
    >
      <DialogTrigger asChild>
        <Button
          ref={gatilhoRef}
          variant="ghost"
          size="icon"
          className="relative size-11 shrink-0 rounded-full"
          aria-label="Abrir menu"
          title="Menu"
        >
          <Menu size={22} aria-hidden="true" />
          {pendente && (
            <span
              aria-hidden="true"
              className="bg-falta absolute top-2 right-2 size-1.5 rounded-full"
            />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={menuRef}
        lateral={{ aberto }}
        showCloseButton={false}
        aria-modal="true"
        aria-describedby={undefined}
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          menuRef.current
            ?.querySelector<HTMLButtonElement>('nav button[aria-current="page"]')
            ?.focus();
        }}
        onCloseAutoFocus={(evento) => {
          // Chega depois de o Radix devolver o body; a marca já pode sair.
          raizRef.current?.removeAttribute("data-gaveta-aberta");
          if (destinoFoco === "gatilho") return;
          evento.preventDefault();
          if (destinoFoco === "conteudo") conteudoRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Menu do aplicativo</DialogTitle>
        {renderizarConteudo(fechar)}
      </DialogContent>
    </Dialog>
  );
}

export default function Aplicacao({
  usuario,
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
  const [visitadas, setVisitadas] = useState<Set<Visao>>(() => new Set([inicial]));
  const [series, setSeries] = useState<Serie[]>(seriesIniciais);
  const [turmas, setTurmas] = useState<Turma[]>(turmasIniciais);
  const [alunos, setAlunos] = useState<Aluno[]>(alunosIniciais);
  const [frequencias, setFrequencias] = useState<Frequencia[]>(frequenciasIniciais);
  const [carregandoFrequencias, setCarregandoFrequencias] = useState(false);
  const [erroFrequencias, setErroFrequencias] = useState("");
  const pedidoFrequencias = useRef(0);
  const [saidas, setSaidas] = useState<SaidaAntecipada[]>(saidasIniciais);
  const [justificativas, setJustificativas] =
    useState<JustificativaConfigurada[]>(justificativasIniciais);
  const [liberadores, setLiberadores] = useState<LiberadorConfigurado[]>(liberadoresIniciais);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(configuracoesIniciais);
  const [resumo, setResumo] = useState<ResumoAcumulado | null>(resumoInicial);
  const [versaoFrequencias, setVersaoFrequencias] = useState(0);
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [alvo, setAlvo] = useState<{ dia: string; turmaId: string } | null>(null);
  const [pendencias, setPendencias] = useState<Visao[]>([]);
  const [saidaComPendencia, setSaidaComPendencia] = useState(false);
  const [visaoComPendencia, setVisaoComPendencia] = useState<Visao | null>(null);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const gatilhoMenuRef = useRef<HTMLButtonElement | null>(null);
  const origemDialogoRef = useRef<HTMLElement | null>(null);
  const conteudoRef = useRef<HTMLElement | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const [offline, setOffline] = useState(false);
  const [abaRelatoriosInicial] = useState<AbaRelatorio | undefined>(() =>
    abaRelatoriosDe(visaoInicial),
  );
  const pagerRef = useRef<HTMLDivElement | null>(null);

  const itemFinal = useMemo(
    () => ITENS_FIM.find((item) => item.visao === (ehAdmin ? "gestao" : "alunos")),
    [ehAdmin],
  );
  const itens = useMemo<ItemNav[]>(() => {
    const lista = [...ITENS_INICIAIS];
    if (podeOperar) lista.push(ITEM_CHAMADA_PARCIAL);
    if (configuracoes.saidaAntecipada) lista.push(ITEM_SAIDAS);
    lista.push(ITEM_RELATORIOS);
    if (itemFinal) lista.push(itemFinal);
    return lista;
  }, [configuracoes.saidaAntecipada, itemFinal, podeOperar]);
  // A Chamada Parcial abre pelo botão de ícone da Chamada: continua entre os
  // painéis, mas sem item próprio no menu, e a Chamada fica ativa nela.
  const itensNavegacao = useMemo(
    () => itens.filter((item) => item.visao !== "chamada-parcial"),
    [itens],
  );
  const visaoNavegacao: Visao = visao === "chamada-parcial" ? "chamada" : visao;
  const indiceAtivo = itens.findIndex((item) => item.visao === visao);
  // Posição de rolagem de cada painel, para os painéis distantes não a perderem.
  const posicoes = useRef(new Map<Visao, number>());

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

  const recarregarSaidas = useCallback(async (novoMes: string) => {
    const dias = diasDoMes(novoMes);
    const primeiro = dias[0] ?? `${novoMes}-01`;
    const ultimo = dias[dias.length - 1] ?? `${novoMes}-28`;
    try {
      const dados = await pedir<{ saidas: SaidaAntecipada[] }>(
        `/api/saidas?de=${primeiro}&ate=${ultimo}`,
      );
      setSaidas(dados.saidas);
    } catch (excecao) {
      avisarErro(excecao, {
        contexto: "Não foi possível atualizar as saídas.",
        descricao: "As informações na tela podem estar desatualizadas.",
      });
    }
  }, []);

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

  const ativarVisao = useCallback(
    (proxima: Visao) => {
      if (!itens.some((item) => item.visao === proxima)) return;
      setVisao(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
    },
    [itens],
  );
  const trocarVisao = useCallback(
    (proxima: Visao) => {
      if (!itens.some((item) => item.visao === proxima) || proxima === visao) return;
      if (visao === "chamada-parcial" && pendencias.includes("chamada-parcial")) {
        setVisaoComPendencia(proxima);
        return;
      }
      ativarVisao(proxima);
    },
    [ativarVisao, itens, pendencias, visao],
  );
  function navegarPeloMenu(proxima: Visao, fecharMenu: FecharMenu) {
    const pedeConferencia =
      visao === "chamada-parcial" && pendencias.includes("chamada-parcial") && proxima !== visao;
    if (pedeConferencia) {
      origemDialogoRef.current = gatilhoMenuRef.current;
      fecharMenu("dialogo");
      trocarVisao(proxima);
      return;
    }
    fecharMenu();
    // A gaveta fecha primeiro; a nova tela renderiza numa transição, sem
    // segurar o início da animação de saída.
    startTransition(() => trocarVisao(proxima));
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
  // Guarda e devolve a rolagem de cada painel, para os painéis distantes que
  // saem da pintura não perderem a posição ao voltar.
  const guardarRolagem = useCallback((alvo: Visao, evento: React.UIEvent<HTMLElement>) => {
    posicoes.current.set(alvo, evento.currentTarget.scrollTop);
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

  useEffect(() => {
    function avisarSaida(evento: BeforeUnloadEvent) {
      if (pendencias.length > 0) {
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
  }, [pendencias, router]);

  const { executando: saindo, executar: executarSaida } = useAcaoUnica(async () => {
    try {
      await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    avisarSucesso("Sessão encerrada.");
    router.refresh();
  });

  function sair() {
    if (pendencias.length > 0) {
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
      <div className={`mx-auto w-full ${LARGURAS[alvoVisao]}`}>
        {alvoVisao === "painel" && (
          <VistaPainel
            ativo={ativo}
            diaCorrente={diaCorrente}
            mes={mes}
            series={series}
            turmas={turmas}
            alunos={alunos}
            frequencias={frequencias}
            saidas={saidas}
            configuracoes={configuracoes}
            onRecarregar={recarregarMes}
          />
        )}
        {alvoVisao === "chamada" && (
          <VistaFrequencia
            usuario={usuario}
            turmas={turmas}
            alunos={alunos}
            diaCorrente={diaCorrente}
            fuso={fuso}
            alvo={alvo}
            configuracoes={configuracoes}
            catalogoJustificativas={justificativas}
            resumo={resumo}
            onFrequenciasMudaram={recarregarFrequencias}
            onPendencia={registrarPendenciasChamada}
            onAbrirGestao={ehAdmin ? () => trocarVisao("gestao") : undefined}
            onAbrirParcial={podeOperar ? () => trocarVisao("chamada-parcial") : undefined}
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
            onPendencia={registrarPendenciaParcial}
          />
        )}
        {alvoVisao === "horarios" && <VistaHorarios turmas={turmas} diaCorrente={diaCorrente} />}
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
            onSaidasMudaram={recarregarSaidas}
            ativo={ativo}
          />
        )}
        {alvoVisao === "relatorios" && (
          <VistaRelatorios
            ativo={ativo}
            carregando={carregandoFrequencias}
            erro={erroFrequencias}
            abaInicial={abaRelatoriosInicial}
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
        {alvoVisao === "alunos" && <VistaAlunos alunos={alunos} turmas={turmas} />}
        {alvoVisao === "gestao" && ehAdmin && (
          <VistaGestao
            planilhaInicial={planilhaInicial}
            abaInicial={abaGestaoInicial}
            usuarioId={usuario.id}
            series={series}
            turmas={turmas}
            alunos={alunos}
            configuracoes={configuracoes}
            diaCorrente={diaCorrente}
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
            onAbrirSaidas={() => trocarVisao("saidas")}
            onAbrirParcial={() => trocarVisao("chamada-parcial")}
          />
        )}
      </div>
    );
  }

  function renderizarMenu(fecharMenu?: FecharMenu) {
    const movel = fecharMenu !== undefined;
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: movel ? "env(safe-area-inset-bottom)" : undefined,
          paddingLeft: movel ? "env(safe-area-inset-left)" : undefined,
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-4">
          <p className="text-lg font-semibold tracking-tight">FrequenciApp</p>
          {movel && (
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-full"
                aria-label="Fechar menu"
              >
                <X size={20} aria-hidden="true" />
              </Button>
            </DialogClose>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <nav
            aria-label="Seções do aplicativo"
            className="flex shrink-0 flex-col gap-1.5 px-3 pb-3"
          >
            {itensNavegacao.map((item) => (
              <ItemNavegacao
                key={item.visao}
                item={item}
                ativo={visaoNavegacao === item.visao}
                pendente={
                  pendencias.includes(item.visao) ||
                  (item.visao === "chamada" && pendencias.includes("chamada-parcial"))
                }
                indicador={movel ? undefined : "indicador-lateral"}
                onTrocar={
                  fecharMenu ? (proxima) => navegarPeloMenu(proxima, fecharMenu) : trocarVisao
                }
              />
            ))}
          </nav>
          <div className="border-border mt-auto shrink-0 border-t p-3">
            <div className="flex items-center gap-2 px-1">
              <span className="vidro-selecionado flex size-9 shrink-0 items-center justify-center rounded-full">
                <UserRound size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{usuario.nome}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {rotuloDePapel(usuario.papel)}
                </span>
              </span>
              <SeletorTema />
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-full justify-start gap-2"
                onClick={(evento) => {
                  origemDialogoRef.current = movel ? gatilhoMenuRef.current : evento.currentTarget;
                  fecharMenu?.("dialogo");
                  setNotificacoesAbertas(true);
                }}
              >
                <Bell size={16} aria-hidden="true" />
                Configurar notificações
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-full justify-start gap-2"
                onClick={(evento) => {
                  origemDialogoRef.current = movel ? gatilhoMenuRef.current : evento.currentTarget;
                  fecharMenu?.("dialogo");
                  setSenhaAberta(true);
                }}
              >
                <KeyRound size={16} aria-hidden="true" />
                Trocar senha
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-full justify-start gap-2"
                onClick={(evento) => {
                  origemDialogoRef.current = movel ? gatilhoMenuRef.current : evento.currentTarget;
                  fecharMenu?.(pendencias.length > 0 ? "dialogo" : "gatilho");
                  void sair();
                }}
                disabled={saindo}
              >
                <LogOut size={16} aria-hidden="true" />
                Sair da conta
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={raizRef}
        className="flex h-dvh w-full flex-col lg:flex-row"
        style={{
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <a
          href="#conteudo"
          className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
        >
          Pular para o conteúdo
        </a>

        <aside className="superficie-vidro hidden min-h-0 w-60 shrink-0 flex-col rounded-none border-0 border-r lg:flex">
          {renderizarMenu()}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            className="superficie-vidro vidro-flutuante shrink-0 rounded-none border-0 border-b lg:hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6">
              <MenuMovel
                raizRef={raizRef}
                gatilhoRef={gatilhoMenuRef}
                conteudoRef={conteudoRef}
                pendente={pendencias.length > 0}
                renderizarConteudo={renderizarMenu}
              />
              <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
                FrequenciApp
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 rounded-full"
                aria-label="Configurar notificações"
                title="Configurar notificações"
                onClick={(evento) => {
                  origemDialogoRef.current = evento.currentTarget;
                  setNotificacoesAbertas(true);
                }}
              >
                <Bell size={18} aria-hidden="true" />
              </Button>
            </div>
          </header>

          {offline && (
            <div
              role="status"
              className="bg-falta-fraca text-falta-texto flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-xs"
            >
              <WifiOff size={14} aria-hidden="true" />
              Sem conexão. As marcações continuam na tela e precisam de internet para salvar.
            </div>
          )}

          <main
            ref={conteudoRef}
            tabIndex={-1}
            id="conteudo"
            data-visao={visao}
            className="relative min-h-0 flex-1 overflow-hidden"
          >
            <div ref={pagerRef} data-pager="principal" className="h-full overflow-hidden">
              {itens.map((item, indice) => {
                const ativo = item.visao === visao;
                const distante = Math.abs(indice - indiceAtivo) > 1;
                if (!ativo && !visitadas.has(item.visao)) return null;
                return (
                  <section
                    key={item.visao}
                    role="group"
                    aria-label={item.rotulo}
                    aria-hidden={!ativo}
                    inert={!ativo}
                    data-distante={distante ? "true" : undefined}
                    hidden={!ativo}
                    onScroll={(evento) => guardarRolagem(item.visao, evento)}
                    className="pagina-painel h-full w-full overflow-y-auto px-4 pt-4 pb-0 sm:px-6 lg:px-8"
                  >
                    {renderizarVisao(item.visao, ativo)}
                  </section>
                );
              })}
            </div>
          </main>
        </div>
      </div>

      <AlertDialog open={saidaComPendencia} onOpenChange={setSaidaComPendencia}>
        <AlertDialogContent
          onCloseAutoFocus={(evento) => {
            evento.preventDefault();
            devolverFocoDoDialogo();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Há alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Se sair agora, as marcações não salvas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar aqui</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarSaida} disabled={saindo}>
              Sair mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={visaoComPendencia !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setVisaoComPendencia(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(evento) => {
            evento.preventDefault();
            devolverFocoDoDialogo();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Há alterações não salvas na Chamada Parcial</AlertDialogTitle>
            <AlertDialogDescription>
              Os registros continuam pendentes. Ao voltar, será possível salvá-los.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar aqui</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const proxima = visaoComPendencia;
                setVisaoComPendencia(null);
                if (proxima) ativarVisao(proxima);
              }}
            >
              Mudar de tela
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <RegistroPwa />
    </>
  );
}
