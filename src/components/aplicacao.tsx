"use client";

// Shell da aplicação: cabeçalho, troca de visões e navegação inferior.
// Uma única página com visões locais, como o fluxo original do app.
// Administradores ganham a visão Gestão no lugar de Alunos (somente
// leitura para professores, edição completa para administradores).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ClipboardCheck,
  History,
  KeyRound,
  LogOut,
  Moon,
  Sun,
  UsersRound,
  Settings2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Aluno, Frequencia, Serie, Turma } from "@/domain/frequencia";
import { primeiroNome, rotuloDePapel, type Identidade } from "@/domain/usuarios";
import { pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import VistaFrequencia from "@/components/frequencia/vista-frequencia";
import VistaHistorico from "@/components/historico/vista-historico";
import VistaOriginais from "@/components/originais/vista-originais";
import VistaAlunos from "@/components/alunos/vista-alunos";
import VistaGestao from "@/components/gestao/vista-gestao";
import DialogoSenha from "@/components/conta/dialogo-senha";
import RegistroPwa from "@/components/pwa/registro-pwa";

export type Visao = "frequencia" | "historico" | "originais" | "alunos" | "gestao";

interface Props {
  usuario: Identidade;
  diaCorrente: string;
  seriesIniciais: Serie[];
  turmasIniciais: Turma[];
  origensIniciais: Turma[];
  alunosIniciais: Aluno[];
  frequenciasIniciais: Frequencia[];
}

const ITENS_BASE: { visao: Visao; rotulo: string; icone: typeof ClipboardCheck }[] = [
  { visao: "frequencia", rotulo: "Frequencia", icone: ClipboardCheck },
  { visao: "historico", rotulo: "Histórico", icone: History },
  { visao: "originais", rotulo: "Originais", icone: UsersRound },
];

const ITENS_FIM: { visao: Visao; rotulo: string; icone: typeof ClipboardCheck }[] = [
  { visao: "alunos", rotulo: "Alunos", icone: Users },
  { visao: "gestao", rotulo: "Gestão", icone: Settings2 },
];

const TRANSICAO = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

export default function Aplicacao({
  usuario,
  diaCorrente,
  seriesIniciais,
  turmasIniciais,
  origensIniciais,
  alunosIniciais,
  frequenciasIniciais,
}: Props) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [visao, setVisao] = useState<Visao>("frequencia");
  const [series, setSeries] = useState<Serie[]>(seriesIniciais);
  const [turmas, setTurmas] = useState<Turma[]>(turmasIniciais);
  const [origens, setOrigens] = useState<Turma[]>(origensIniciais);
  const [alunos, setAlunos] = useState<Aluno[]>(alunosIniciais);
  const [frequencias, setFrequencias] = useState<Frequencia[]>(frequenciasIniciais);
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [alvo, setAlvo] = useState<{ dia: string; turmaId: string } | null>(null);
  const [pendencias, setPendencias] = useState<Visao[]>([]);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const rolagens = useRef<Record<Visao, number>>({
    frequencia: 0,
    historico: 0,
    originais: 0,
    alunos: 0,
    gestao: 0,
  });

  const ehAdmin = usuario.papel === "ADMIN";
  const itemFinal = ITENS_FIM.find((item) => item.visao === (ehAdmin ? "gestao" : "alunos"));
  const itens = itemFinal ? [...ITENS_BASE, itemFinal] : [...ITENS_BASE];
  // O tema só é conhecido depois da montagem: renderizar o ícone antes
  // disso geraria divergência entre servidor e cliente. O snapshot de
  // servidor devolve falso e o de cliente, verdadeiro.
  const temaMontado = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const rotuloTurma = useCallback(
    (id: string) =>
      turmas.find((t) => t.id === id)?.rotulo ?? origens.find((t) => t.id === id)?.rotulo ?? "",
    [turmas, origens],
  );

  const recarregarAlunos = useCallback(async () => {
    const dados = await pedir<{ alunos: Aluno[] }>("/api/alunos");
    setAlunos(dados.alunos);
  }, []);

  const recarregarEscopo = useCallback(async () => {
    const dados = await pedir<{ turmas: Turma[]; origens: Turma[] }>("/api/turmas");
    setTurmas(dados.turmas);
    setOrigens(dados.origens);
  }, []);

  const recarregarFrequencias = useCallback(async (novoMes: string) => {
    setMes(novoMes);
    const dados = await pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?mes=${novoMes}`);
    setFrequencias(dados.frequencias);
  }, []);

  useEffect(() => {
    function avisarSaida(evento: BeforeUnloadEvent) {
      if (pendencias.length > 0) {
        evento.preventDefault();
        evento.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", avisarSaida);
    return () => window.removeEventListener("beforeunload", avisarSaida);
  }, [pendencias]);

  function trocarVisao(proxima: Visao) {
    if (proxima === visao) return;
    rolagens.current[visao] = window.scrollY;
    setVisao(proxima);
    requestAnimationFrame(() => {
      window.scrollTo({ top: rolagens.current[proxima], behavior: "instant" });
    });
  }

  function abrirFrequencia(dia: string, turmaId: string) {
    setAlvo({ dia, turmaId });
    trocarVisao("frequencia");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function sair() {
    try {
      await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    router.refresh();
  }

  const escuro = resolvedTheme === "dark";

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">Frequencia</span>
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {primeiroNome(usuario.nome)} · {rotuloDePapel(usuario.papel)}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={temaMontado && escuro ? "Ativar tema claro" : "Ativar tema escuro"}
                onClick={() => setTheme(escuro ? "light" : "dark")}
              >
                {temaMontado ? escuro ? <Sun size={18} /> : <Moon size={18} /> : <Moon size={18} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Trocar minha senha"
                onClick={() => setSenhaAberta(true)}
              >
                <KeyRound size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Sair da conta"
                onClick={sair}
              >
                <LogOut size={18} />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-40 sm:px-6" data-visao={visao}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={visao}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={TRANSICAO}
            >
              {visao === "frequencia" && (
                <VistaFrequencia
                  usuario={usuario}
                  turmas={turmas}
                  alunos={alunos}
                  diaCorrente={diaCorrente}
                  alvo={alvo}
                  onFrequenciasMudaram={recarregarFrequencias}
                  onPendencia={setPendencias}
                />
              )}
              {visao === "historico" && (
                <VistaHistorico
                  frequencias={frequencias}
                  mes={mes}
                  onMes={setMes}
                  onAbrir={abrirFrequencia}
                  onRecarregar={recarregarFrequencias}
                  bloqueado={pendencias.includes("frequencia")}
                  rotuloTurma={rotuloTurma}
                />
              )}
              {visao === "originais" && (
                <VistaOriginais
                  alunos={alunos}
                  frequencias={frequencias}
                  mes={mes}
                  onMes={setMes}
                  onRecarregar={recarregarFrequencias}
                  origens={origens}
                />
              )}
              {visao === "alunos" && <VistaAlunos alunos={alunos} turmas={turmas} />}
              {visao === "gestao" && ehAdmin && (
                <VistaGestao
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
                  rotuloTurma={rotuloTurma}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav
          aria-label="Seções do aplicativo"
          className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-3xl border-t backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="grid grid-cols-4">
            {itens.map((item) => {
              const Icone = item.icone;
              const ativo = visao === item.visao;
              return (
                <button
                  key={item.visao}
                  type="button"
                  aria-current={ativo ? "page" : undefined}
                  onClick={() => trocarVisao(item.visao)}
                  className="text-muted-foreground hover:text-foreground aria-[current=page]:text-primary relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors active:scale-[0.98]"
                >
                  {ativo && (
                    <motion.span
                      layoutId="indicador-nav"
                      className="bg-primary/15 absolute inset-x-4 top-0 h-0.5 rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <motion.span
                    animate={ativo ? { scale: 1.08 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 26 }}
                  >
                    <Icone size={20} strokeWidth={ativo ? 2 : 1.7} />
                  </motion.span>
                  <span>{item.rotulo}</span>
                  {item.visao === "frequencia" && pendencias.includes("frequencia") && (
                    <span
                      aria-label="Alterações não salvas"
                      className="bg-falta absolute size-1.5 translate-x-4 -translate-y-4 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <DialogoSenha aberto={senhaAberta} onAbrir={setSenhaAberta} />
        <RegistroPwa />
      </div>
    </MotionConfig>
  );
}
