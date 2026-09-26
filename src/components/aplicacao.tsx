"use client";

// Shell da aplicação: cabeçalho, troca de visões por botões e navegação
// inferior no celular, barra lateral no desktop. A administração ganha a
// visão Gestão no lugar de Alunos.
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  ChartPie,
  ClipboardCheck,
  DoorOpen,
  KeyRound,
  LogOut,
  Settings2,
  Table2,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import type {
  Aluno,
  Configuracoes,
  Frequencia,
  JustificativaConfigurada,
  ResumoAcumulado,
  Responsavel,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { diasDoMes } from "@/domain/frequencia";
import { primeiroNome, rotuloDePapel, type Identidade } from "@/domain/usuarios";
import { pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SeletorTema } from "@/components/ui/seletor-tema";
import VistaFrequencia from "@/components/frequencia/vista-frequencia";
import VistaPainel from "@/components/painel/vista-painel";
import VistaSaidas from "@/components/saidas/vista-saidas";
import VistaRelatorios, { type AbaRelatorio } from "@/components/relatorios/vista-relatorios";
import VistaAlunos from "@/components/alunos/vista-alunos";
import VistaGestao from "@/components/gestao/vista-gestao";
import DialogoSenha from "@/components/conta/dialogo-senha";
import RegistroPwa from "@/components/pwa/registro-pwa";

export type Visao = "painel" | "chamada" | "saidas" | "relatorios" | "alunos" | "gestao";

interface Props {
  usuario: Identidade;
  diaCorrente: string;
  fuso: string;
  visaoInicial?: string;
  seriesIniciais: Serie[];
  turmasIniciais: Turma[];
  alunosIniciais: Aluno[];
  frequenciasIniciais: Frequencia[];
  saidasIniciais: SaidaAntecipada[];
  justificativasIniciais: JustificativaConfigurada[];
  responsaveisIniciais: Responsavel[];
  configuracoesIniciais: Configuracoes;
  resumoInicial: ResumoAcumulado | null;
}

const VISOES: Visao[] = ["painel", "chamada", "saidas", "relatorios", "alunos", "gestao"];

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
];

const ITEM_SAIDAS: ItemNav = { visao: "saidas", rotulo: "Saídas", icone: DoorOpen };
const ITEM_RELATORIOS: ItemNav = { visao: "relatorios", rotulo: "Relatórios", icone: Table2 };

const ITENS_FIM: ItemNav[] = [
  { visao: "alunos", rotulo: "Alunos", icone: Users },
  { visao: "gestao", rotulo: "Gestão", icone: Settings2 },
];

const LARGURAS: Record<Visao, string> = {
  painel: "max-w-5xl lg:max-w-none",
  chamada: "max-w-2xl lg:max-w-none",
  saidas: "max-w-3xl lg:max-w-none",
  relatorios: "max-w-5xl lg:max-w-none",
  alunos: "max-w-3xl lg:max-w-none",
  gestao: "max-w-5xl lg:max-w-none",
};

interface ItemNavegacaoProps {
  item: ItemNav;
  ativo: boolean;
  pendente: boolean;
  /** Identificador do indicador com mola da sidebar; ausente na barra inferior. */
  indicador?: string;
  onTrocar: (visao: Visao) => void;
}

function ItemNavegacao({ item, ativo, pendente, indicador, onTrocar }: ItemNavegacaoProps) {
  const Icone = item.icone;
  const semMovimento = useReducedMotion() ?? false;
  return (
    <button
      type="button"
      aria-current={ativo ? "page" : undefined}
      onClick={() => onTrocar(item.visao)}
      className="text-muted-foreground hover:text-foreground aria-[current=page]:text-primary pressionavel relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors lg:min-h-11 lg:w-full lg:flex-row lg:justify-start lg:gap-2.5 lg:rounded-lg lg:px-3 lg:text-sm"
    >
      {ativo &&
        indicador &&
        (semMovimento ? (
          <span className="bg-primary/15 absolute inset-x-4 top-0 h-0.5 rounded-full lg:inset-x-0 lg:inset-y-1 lg:h-auto lg:w-1" />
        ) : (
          <motion.span
            layoutId={indicador}
            className="bg-primary/15 absolute inset-x-4 top-0 h-0.5 rounded-full lg:inset-x-0 lg:inset-y-1 lg:h-auto lg:w-1"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        ))}
      {semMovimento ? (
        <span className="flex h-5 items-center lg:hidden">
          <Icone size={20} strokeWidth={ativo ? 2 : 1.7} />
        </span>
      ) : (
        <motion.span
          animate={ativo ? { scale: 1.08 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 26 }}
          className="flex h-5 items-center lg:hidden"
        >
          <Icone size={20} strokeWidth={ativo ? 2 : 1.7} />
        </motion.span>
      )}
      <Icone
        size={18}
        strokeWidth={ativo ? 2 : 1.7}
        aria-hidden="true"
        className="hidden lg:block"
      />
      <span className="whitespace-nowrap">{item.rotulo}</span>
      {pendente && (
        <span
          aria-label="Alterações não salvas"
          className="bg-falta absolute size-1.5 translate-x-4 -translate-y-4 rounded-full lg:static lg:ml-1 lg:translate-x-0 lg:translate-y-0"
        />
      )}
    </button>
  );
}

export default function Aplicacao({
  usuario,
  diaCorrente,
  fuso,
  visaoInicial,
  seriesIniciais,
  turmasIniciais,
  alunosIniciais,
  frequenciasIniciais,
  saidasIniciais,
  justificativasIniciais,
  responsaveisIniciais,
  configuracoesIniciais,
  resumoInicial,
}: Props) {
  const router = useRouter();
  const ehAdmin = usuario.papel === "ADMIN";
  const pedida = visaoValida(visaoInicial);
  const inicial =
    pedida &&
    (pedida !== "gestao" || ehAdmin) &&
    (pedida !== "saidas" || configuracoesIniciais.saidaAntecipada)
      ? pedida
      : "painel";
  const [visao, setVisao] = useState<Visao>(inicial);
  const [visitadas, setVisitadas] = useState<Set<Visao>>(() => new Set([inicial]));
  const [series, setSeries] = useState<Serie[]>(seriesIniciais);
  const [turmas, setTurmas] = useState<Turma[]>(turmasIniciais);
  const [alunos, setAlunos] = useState<Aluno[]>(alunosIniciais);
  const [frequencias, setFrequencias] = useState<Frequencia[]>(frequenciasIniciais);
  const [saidas, setSaidas] = useState<SaidaAntecipada[]>(saidasIniciais);
  const [justificativas, setJustificativas] =
    useState<JustificativaConfigurada[]>(justificativasIniciais);
  const [responsaveis] = useState<Responsavel[]>(responsaveisIniciais);
  const [configuracoes, setConfiguracoes] = useState<Configuracoes>(configuracoesIniciais);
  const [resumo, setResumo] = useState<ResumoAcumulado | null>(resumoInicial);
  const [versaoFrequencias, setVersaoFrequencias] = useState(0);
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [alvo, setAlvo] = useState<{ dia: string; turmaId: string } | null>(null);
  const [pendencias, setPendencias] = useState<Visao[]>([]);
  const [senhaAberta, setSenhaAberta] = useState(false);
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
    if (configuracoes.saidaAntecipada) lista.push(ITEM_SAIDAS);
    lista.push(ITEM_RELATORIOS);
    if (itemFinal) lista.push(itemFinal);
    return lista;
  }, [configuracoes.saidaAntecipada, itemFinal]);
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
      setMes(novoMes);
      try {
        const dados = await pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?mes=${novoMes}`);
        setFrequencias(dados.frequencias);
        setVersaoFrequencias((valor) => valor + 1);
        try {
          const resumoDados = await pedir<{ resumo: ResumoAcumulado }>(
            `/api/frequencias/resumo?ate=${diaCorrente}`,
          );
          setResumo(resumoDados.resumo);
        } catch {
          // O acumulado é complementar: a chamada segue sem ele.
        }
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível atualizar as frequências.",
          descricao: "As informações na tela podem estar desatualizadas.",
        });
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

  const trocarVisao = useCallback(
    (proxima: Visao) => {
      if (!itens.some((item) => item.visao === proxima)) return;
      setVisao(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
    },
    [itens],
  );
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
      toast.error("Sua sessão expirou. Entre novamente.");
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

  const { executando: saindo, executar: sair } = useAcaoUnica(async () => {
    if (pendencias.length > 0) {
      const confirmar = window.confirm("Há alterações não salvas na chamada. Sair mesmo assim?");
      if (!confirmar) return;
    }
    try {
      await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    avisarSucesso("Sessão encerrada.");
    router.refresh();
  });

  function renderizarVisao(alvoVisao: Visao) {
    return (
      <div className={`mx-auto w-full ${LARGURAS[alvoVisao]}`}>
        {alvoVisao === "painel" && (
          <VistaPainel
            diaCorrente={diaCorrente}
            mes={mes}
            series={series}
            turmas={turmas}
            alunos={alunos}
            frequencias={frequencias}
            saidas={saidas}
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
            onPendencia={setPendencias}
            onAbrirGestao={ehAdmin ? () => trocarVisao("gestao") : undefined}
          />
        )}
        {alvoVisao === "saidas" && configuracoes.saidaAntecipada && (
          <VistaSaidas
            usuarioId={usuario.id}
            diaCorrente={diaCorrente}
            fuso={fuso}
            mes={mes}
            turmas={turmas}
            alunos={alunos}
            responsaveis={responsaveis}
            catalogoJustificativas={justificativas}
            saidas={saidas}
            onSaidasMudaram={recarregarSaidas}
          />
        )}
        {alvoVisao === "relatorios" && (
          <VistaRelatorios
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
            usuarioId={usuario.id}
            series={series}
            turmas={turmas}
            alunos={alunos}
            configuracoes={configuracoes}
            diaCorrente={diaCorrente}
            justificativas={justificativas}
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
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex h-dvh w-full flex-col lg:flex-row"
        style={{
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <a
          href="#conteudo"
          className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
        >
          Pular para o conteúdo
        </a>

        <aside className="border-border bg-card/40 hidden w-60 shrink-0 flex-col border-r lg:flex">
          {" "}
          <div className="px-4 py-5">
            <p className="text-lg font-semibold tracking-tight">FrequenciApp</p>
            <p className="text-muted-foreground text-xs">Registro de frequência escolar</p>
          </div>
          <nav aria-label="Seções do aplicativo" className="flex flex-1 flex-col gap-1 px-2">
            {itens.map((item) => (
              <ItemNavegacao
                key={item.visao}
                item={item}
                ativo={visao === item.visao}
                pendente={item.visao === "chamada" && pendencias.includes("chamada")}
                indicador="indicador-lateral"
                onTrocar={trocarVisao}
              />
            ))}
          </nav>
          <div className="border-border mt-4 border-t p-3">
            <div className="flex items-center gap-2 px-1">
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
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
                onClick={() => setSenhaAberta(true)}
              >
                <KeyRound size={16} />
                Trocar senha
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-full justify-start gap-2"
                onClick={() => void sair()}
                disabled={saindo}
              >
                <LogOut size={16} />
                Sair da conta
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            className="bg-background/95 supports-[backdrop-filter]:bg-background/85 shrink-0 border-b backdrop-blur lg:hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight">FrequenciApp</span>
                <span className="text-muted-foreground hidden text-sm sm:inline">
                  {primeiroNome(usuario.nome)} · {rotuloDePapel(usuario.papel)}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <SeletorTema />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 rounded-full"
                      aria-label={`Conta de ${usuario.nome}`}
                    >
                      <UserRound size={18} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72">
                    <div className="px-2.5 py-2">
                      <p className="truncate text-sm font-medium">{usuario.nome}</p>
                      <p className="text-muted-foreground truncate text-xs">{usuario.email}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {rotuloDePapel(usuario.papel)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-0.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setSenhaAberta(true)}
                        className="hover:bg-accent active:bg-accent/80 pressionavel flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors"
                      >
                        <KeyRound size={16} aria-hidden="true" />
                        Trocar minha senha
                      </button>
                      <button
                        type="button"
                        onClick={() => void sair()}
                        disabled={saindo}
                        className="text-falta-texto hover:bg-accent active:bg-accent/80 pressionavel flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <LogOut size={16} aria-hidden="true" />
                        Sair da conta
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
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
                    {renderizarVisao(item.visao)}
                  </section>
                );
              })}
            </div>
          </main>

          <nav
            aria-label="Seções do aplicativo"
            className="bg-background/95 supports-[backdrop-filter]:bg-background/85 shrink-0 border-t backdrop-blur lg:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="relative">
              <span
                aria-hidden="true"
                data-indicador="inferior"
                style={{
                  width: `${100 / itens.length}%`,
                  left: `${(Math.max(indiceAtivo, 0) * 100) / itens.length}%`,
                }}
                className="pointer-events-none absolute top-0 left-0 h-0.5"
              >
                <span className="bg-primary/15 mx-4 block h-full rounded-full" />
              </span>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
              >
                {itens.map((item) => (
                  <ItemNavegacao
                    key={item.visao}
                    item={item}
                    ativo={visao === item.visao}
                    pendente={item.visao === "chamada" && pendencias.includes("chamada")}
                    onTrocar={trocarVisao}
                  />
                ))}
              </div>
            </div>
          </nav>
        </div>
      </div>

      <DialogoSenha aberto={senhaAberta} onAbrir={setSenhaAberta} />
      <RegistroPwa />
    </>
  );
}
