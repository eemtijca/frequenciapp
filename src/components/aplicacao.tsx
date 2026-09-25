"use client";

// Shell da aplicação: cabeçalho, troca de visões por deslize e navegação
// inferior no celular, barra lateral no desktop. A administração ganha a
// visão Gestão no lugar de Alunos.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import {
  ClipboardCheck,
  History,
  KeyRound,
  LogOut,
  Settings2,
  UserRound,
  Users,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import type { Aluno, Frequencia, Serie, Turma } from "@/domain/frequencia";
import { primeiroNome, rotuloDePapel, type Identidade } from "@/domain/usuarios";
import { pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SeletorTema } from "@/components/ui/seletor-tema";
import VistaFrequencia from "@/components/frequencia/vista-frequencia";
import VistaHistorico from "@/components/historico/vista-historico";
import VistaGrade from "@/components/grade/vista-grade";
import VistaAlunos from "@/components/alunos/vista-alunos";
import VistaGestao from "@/components/gestao/vista-gestao";
import DialogoSenha from "@/components/conta/dialogo-senha";
import RegistroPwa from "@/components/pwa/registro-pwa";

export type Visao = "frequencia" | "historico" | "grade" | "alunos" | "gestao";

interface Props {
  usuario: Identidade;
  diaCorrente: string;
  fuso: string;
  visaoInicial?: string;
  seriesIniciais: Serie[];
  turmasIniciais: Turma[];
  alunosIniciais: Aluno[];
  frequenciasIniciais: Frequencia[];
}

const VISOES: Visao[] = ["frequencia", "historico", "grade", "alunos", "gestao"];

function visaoValida(valor: string | undefined): Visao | null {
  return VISOES.find((visao) => visao === valor) ?? null;
}

interface ItemNav {
  visao: Visao;
  rotulo: string;
  icone: typeof ClipboardCheck;
}

const ITENS_BASE: ItemNav[] = [
  { visao: "frequencia", rotulo: "Frequência", icone: ClipboardCheck },
  { visao: "historico", rotulo: "Histórico", icone: History },
  { visao: "grade", rotulo: "Grade", icone: UsersRound },
];

const ITENS_FIM: ItemNav[] = [
  { visao: "alunos", rotulo: "Alunos", icone: Users },
  { visao: "gestao", rotulo: "Gestão", icone: Settings2 },
];

const LARGURAS: Record<Visao, string> = {
  frequencia: "max-w-2xl lg:max-w-none",
  historico: "max-w-3xl lg:max-w-none",
  grade: "max-w-5xl lg:max-w-none",
  alunos: "max-w-3xl lg:max-w-none",
  gestao: "max-w-5xl lg:max-w-none",
};

interface ItemNavegacaoProps {
  item: ItemNav;
  ativo: boolean;
  pendente: boolean;
  indicador: string;
  onTrocar: (visao: Visao) => void;
}

function ItemNavegacao({ item, ativo, pendente, indicador, onTrocar }: ItemNavegacaoProps) {
  const Icone = item.icone;
  return (
    <button
      type="button"
      aria-current={ativo ? "page" : undefined}
      onClick={() => onTrocar(item.visao)}
      className="text-muted-foreground hover:text-foreground aria-[current=page]:text-primary relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors active:scale-[0.98] lg:min-h-11 lg:w-full lg:flex-row lg:justify-start lg:gap-2.5 lg:rounded-lg lg:px-3 lg:text-sm"
    >
      {ativo && (
        <motion.span
          layoutId={indicador}
          className="bg-primary/15 absolute inset-x-4 top-0 h-0.5 rounded-full lg:inset-x-0 lg:inset-y-1 lg:h-auto lg:w-1"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <motion.span
        animate={ativo ? { scale: 1.08 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 26 }}
        className="lg:hidden"
      >
        <Icone size={20} strokeWidth={ativo ? 2 : 1.7} />
      </motion.span>
      <Icone
        size={18}
        strokeWidth={ativo ? 2 : 1.7}
        aria-hidden="true"
        className="hidden lg:block"
      />
      <span>{item.rotulo}</span>
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
}: Props) {
  const router = useRouter();
  const ehAdmin = usuario.papel === "ADMIN";
  const pedida = visaoValida(visaoInicial);
  const inicial = pedida && (pedida !== "gestao" || ehAdmin) ? pedida : "frequencia";
  const [visao, setVisao] = useState<Visao>(inicial);
  const [visitadas, setVisitadas] = useState<Set<Visao>>(() => new Set([inicial]));
  const [series, setSeries] = useState<Serie[]>(seriesIniciais);
  const [turmas, setTurmas] = useState<Turma[]>(turmasIniciais);
  const [alunos, setAlunos] = useState<Aluno[]>(alunosIniciais);
  const [frequencias, setFrequencias] = useState<Frequencia[]>(frequenciasIniciais);
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [alvo, setAlvo] = useState<{ dia: string; turmaId: string } | null>(null);
  const [pendencias, setPendencias] = useState<Visao[]>([]);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [offline, setOffline] = useState(false);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const timerVisao = useRef<number | null>(null);
  const reduzirMovimento = useReducedMotion() ?? false;

  const itemFinal = useMemo(
    () => ITENS_FIM.find((item) => item.visao === (ehAdmin ? "gestao" : "alunos")),
    [ehAdmin],
  );
  const itens = useMemo<ItemNav[]>(
    () => (itemFinal ? [...ITENS_BASE, itemFinal] : [...ITENS_BASE]),
    [itemFinal],
  );

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

  const recarregarFrequencias = useCallback(async (novoMes: string) => {
    setMes(novoMes);
    const dados = await pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?mes=${novoMes}`);
    setFrequencias(dados.frequencias);
  }, []);

  const trocarVisao = useCallback(
    (proxima: Visao) => {
      if (timerVisao.current !== null) {
        window.clearTimeout(timerVisao.current);
        timerVisao.current = null;
      }
      setVisao(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
      const pager = pagerRef.current;
      if (!pager) return;
      const indice = itens.findIndex((item) => item.visao === proxima);
      if (indice < 0) return;
      // No desktop a troca é instantânea: o deslize é gesto de celular.
      const ehDesktop =
        typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      pager.scrollTo({
        left: indice * pager.clientWidth,
        behavior: ehDesktop || reduzirMovimento ? "auto" : "smooth",
      });
    },
    [itens, reduzirMovimento],
  );

  // O deslize monta o painel e o vizinho na hora, mas a visão ativa só muda
  // quando a rolagem para: assim a pílula não passeia pelas visões do meio.
  const aoRolarPager = useCallback(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    const largura = pager.clientWidth;
    if (largura === 0) return;
    const indice = Math.max(0, Math.min(itens.length - 1, Math.round(pager.scrollLeft / largura)));
    const atual = itens[indice];
    if (!atual) return;
    setVisitadas((atuais) => {
      const proximas = new Set(atuais);
      proximas.add(atual.visao);
      const vizinho = itens[indice + 1] ?? itens[indice - 1];
      if (vizinho) proximas.add(vizinho.visao);
      return proximas.size === atuais.size ? atuais : proximas;
    });
    if (timerVisao.current !== null) window.clearTimeout(timerVisao.current);
    timerVisao.current = window.setTimeout(() => {
      timerVisao.current = null;
      setVisao((anterior) => (anterior === atual.visao ? anterior : atual.visao));
    }, 120);
  }, [itens]);

  // Limpa o temporizador da visão ao desmontar.
  useEffect(() => {
    return () => {
      if (timerVisao.current !== null) window.clearTimeout(timerVisao.current);
    };
  }, []);

  // Atalho do manifest: abre direto na visão pedida, sem animação.
  const visaoInicialRef = useRef(inicial);
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    const indice = itens.findIndex((item) => item.visao === visaoInicialRef.current);
    if (indice > 0) pager.scrollTo({ left: indice * pager.clientWidth });
  }, [itens]);

  // Ao redimensionar a janela, reencaixa o paginador na visão ativa.
  useEffect(() => {
    function reencaixar() {
      const pager = pagerRef.current;
      if (!pager) return;
      const indice = itens.findIndex((item) => item.visao === visao);
      if (indice >= 0) pager.scrollTo({ left: indice * pager.clientWidth, behavior: "auto" });
    }
    window.addEventListener("resize", reencaixar);
    return () => window.removeEventListener("resize", reencaixar);
  }, [itens, visao]);

  function abrirFrequencia(dia: string, turmaId: string) {
    setAlvo({ dia, turmaId });
    trocarVisao("frequencia");
    requestAnimationFrame(() => {
      const pager = pagerRef.current;
      const indice = itens.findIndex((item) => item.visao === "frequencia");
      const painel = pager?.children[indice];
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

  async function sair() {
    if (pendencias.length > 0) {
      const confirmar = window.confirm("Há alterações não salvas na frequência. Sair mesmo assim?");
      if (!confirmar) return;
    }
    try {
      await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    router.refresh();
  }

  function renderizarVisao(alvoVisao: Visao) {
    return (
      <div className={`mx-auto w-full ${LARGURAS[alvoVisao]}`}>
        {alvoVisao === "frequencia" && (
          <VistaFrequencia
            usuario={usuario}
            turmas={turmas}
            alunos={alunos}
            diaCorrente={diaCorrente}
            fuso={fuso}
            alvo={alvo}
            onFrequenciasMudaram={recarregarFrequencias}
            onPendencia={setPendencias}
            onAbrirGestao={ehAdmin ? () => trocarVisao("gestao") : undefined}
          />
        )}
        {alvoVisao === "historico" && (
          <VistaHistorico
            frequencias={frequencias}
            turmas={turmas}
            mes={mes}
            mesCorrente={diaCorrente.slice(0, 7)}
            fuso={fuso}
            onMes={setMes}
            onAbrir={abrirFrequencia}
            onRecarregar={recarregarFrequencias}
            bloqueado={pendencias.includes("frequencia")}
            rotuloTurma={rotuloTurma}
          />
        )}
        {alvoVisao === "grade" && (
          <VistaGrade
            alunos={alunos}
            frequencias={frequencias}
            mes={mes}
            mesCorrente={diaCorrente.slice(0, 7)}
            hoje={diaCorrente}
            onMes={setMes}
            onRecarregar={recarregarFrequencias}
            origens={turmas}
          />
        )}
        {alvoVisao === "alunos" && <VistaAlunos alunos={alunos} turmas={turmas} />}
        {alvoVisao === "gestao" && ehAdmin && (
          <VistaGestao
            usuarioId={usuario.id}
            series={series}
            turmas={turmas}
            alunos={alunos}
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
          />
        )}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
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
                pendente={item.visao === "frequencia" && pendencias.includes("frequencia")}
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
                onClick={sair}
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
                  <PopoverContent align="end" className="w-60">
                    <div className="px-2.5 py-2">
                      <p className="truncate text-sm font-medium">{usuario.nome}</p>
                      <p className="text-muted-foreground truncate text-xs">{usuario.email}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {rotuloDePapel(usuario.papel)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-0.5 border-t pt-1">
                      <button
                        type="button"
                        onClick={() => setSenhaAberta(true)}
                        className="hover:bg-accent flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors"
                      >
                        <KeyRound size={16} aria-hidden="true" />
                        Trocar minha senha
                      </button>
                      <button
                        type="button"
                        onClick={() => void sair()}
                        className="text-falta-texto hover:bg-accent flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors"
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
            <div
              ref={pagerRef}
              onScroll={aoRolarPager}
              className="pagina-sem-barra flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
            >
              {itens.map((item) => {
                const ativo = item.visao === visao;
                return (
                  <section
                    key={item.visao}
                    role="group"
                    aria-label={item.rotulo}
                    aria-hidden={!ativo}
                    inert={!ativo}
                    className="h-full w-full shrink-0 snap-start overflow-y-auto overscroll-contain px-4 pt-4 pb-0 sm:px-6 lg:px-8"
                  >
                    {visitadas.has(item.visao) ? renderizarVisao(item.visao) : null}
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
            <div className="grid grid-cols-4">
              {itens.map((item) => (
                <ItemNavegacao
                  key={item.visao}
                  item={item}
                  ativo={visao === item.visao}
                  pendente={item.visao === "frequencia" && pendencias.includes("frequencia")}
                  indicador="indicador-inferior"
                  onTrocar={trocarVisao}
                />
              ))}
            </div>
          </nav>
        </div>
      </div>

      <DialogoSenha aberto={senhaAberta} onAbrir={setSenhaAberta} />
      <RegistroPwa />
    </MotionConfig>
  );
}
