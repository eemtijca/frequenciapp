"use client";

// Gestão: área do administrador. Séries, turmas, alunos e equipe em abas
// curtas, com troca por deslize horizontal no celular e animação no desktop.
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { GraduationCap, ListChecks, School, Users } from "lucide-react";
import type { Aluno, Serie, Turma } from "@/domain/frequencia";
import AbaSeries from "@/components/gestao/aba-series";
import AbaTurmas from "@/components/gestao/aba-turmas";
import AbaAlunos from "@/components/gestao/aba-alunos";
import AbaEquipe from "@/components/gestao/aba-equipe";

export type Aba = "series" | "turmas" | "alunos" | "equipe";

interface Props {
  usuarioId: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  onSeriesMudaram: () => Promise<void>;
  onTurmasMudaram: () => Promise<void>;
  onAlunosMudaram: () => Promise<void>;
}

const ABAS: { aba: Aba; rotulo: string; icone: typeof School }[] = [
  { aba: "series", rotulo: "Séries", icone: GraduationCap },
  { aba: "turmas", rotulo: "Turmas", icone: School },
  { aba: "alunos", rotulo: "Alunos", icone: ListChecks },
  { aba: "equipe", rotulo: "Equipe", icone: Users },
];

export default function VistaGestao({
  usuarioId,
  series,
  turmas,
  alunos,
  onSeriesMudaram,
  onTurmasMudaram,
  onAlunosMudaram,
}: Props) {
  const [aba, setAba] = useState<Aba>("series");
  const [visitadas, setVisitadas] = useState<Set<Aba>>(() => new Set(["series"]));
  const [ehDesktop, setEhDesktop] = useState(false);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const abasRef = useRef<(HTMLButtonElement | null)[]>([]);
  // Índice ativo, modo programático e controles de quadro do deslize.
  const indiceAba = useRef(0);
  const rolagemProgramatica = useRef(false);
  const quadroRolagem = useRef<number | null>(null);
  const timerRolagem = useRef<number | null>(null);
  const controles = useAnimationControls();
  const reduzirMovimento = useReducedMotion() ?? false;

  // No desktop o painel é largo demais para a rolagem suave: a troca é
  // instantânea e o conteúdo faz um deslize curto. No celular, o paginador
  // nativo com arrasto continua valendo.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const atualizar = () => setEhDesktop(media.matches);
    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);

  const trocarAba = useCallback(
    (proxima: Aba, focar = false) => {
      const indice = ABAS.findIndex((item) => item.aba === proxima);
      if (indice < 0) return;
      const indiceAtual = ABAS.findIndex((item) => item.aba === aba);
      if (timerRolagem.current !== null) {
        window.clearTimeout(timerRolagem.current);
        timerRolagem.current = null;
      }
      setAba(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
      const pager = pagerRef.current;
      if (pager) {
        indiceAba.current = indice;
        // A rolagem por toque não deve mudar a aba ao passar pelas do meio.
        rolagemProgramatica.current = true;
        pager.scrollTo({
          left: indice * pager.clientWidth,
          behavior: ehDesktop || reduzirMovimento ? "auto" : "smooth",
        });
        // Rede de segurança para navegadores sem scrollend.
        timerRolagem.current = window.setTimeout(() => {
          timerRolagem.current = null;
          rolagemProgramatica.current = false;
        }, 700);
      }
      if (ehDesktop && !reduzirMovimento && indice !== indiceAtual) {
        controles.set({ x: (indice > indiceAtual ? 1 : -1) * 28, opacity: 0.6 });
        void controles.start({
          x: 0,
          opacity: 1,
          transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
        });
      }
      if (focar) abasRef.current[indice]?.focus();
    },
    [aba, controles, ehDesktop, reduzirMovimento],
  );

  // A pílula acompanha o gesto: a cada quadro, o índice visível vira a aba
  // ativa. Na rolagem programática (toque na aba), o estado não muda, então
  // a pílula vai direto ao destino sem passear pelas abas do meio.
  const aoRolar = useCallback(() => {
    if (quadroRolagem.current !== null) return;
    quadroRolagem.current = window.requestAnimationFrame(() => {
      quadroRolagem.current = null;
      const pager = pagerRef.current;
      if (!pager) return;
      const largura = pager.clientWidth;
      if (largura === 0) return;
      const indice = Math.max(0, Math.min(ABAS.length - 1, Math.round(pager.scrollLeft / largura)));
      const atual = ABAS[indice];
      if (!atual) return;
      setVisitadas((atuais) => {
        const proximas = new Set(atuais);
        proximas.add(atual.aba);
        const vizinha = ABAS[indice + 1] ?? ABAS[indice - 1];
        if (vizinha) proximas.add(vizinha.aba);
        return proximas.size === atuais.size ? atuais : proximas;
      });
      if (rolagemProgramatica.current || indiceAba.current === indice) return;
      indiceAba.current = indice;
      startTransition(() => {
        setAba(atual.aba);
      });
    });
  }, []);

  // Fecha a rolagem no evento nativo quando existir, com o temporizador como
  // rede de segurança para navegadores sem scrollend.
  const fecharRolagem = useCallback(() => {
    if (timerRolagem.current !== null) {
      window.clearTimeout(timerRolagem.current);
      timerRolagem.current = null;
    }
    rolagemProgramatica.current = false;
    const pager = pagerRef.current;
    if (!pager) return;
    const largura = pager.clientWidth;
    if (largura === 0) return;
    const indice = Math.max(0, Math.min(ABAS.length - 1, Math.round(pager.scrollLeft / largura)));
    const atual = ABAS[indice];
    if (!atual) return;
    indiceAba.current = indice;
    startTransition(() => {
      setAba((anterior) => (anterior === atual.aba ? anterior : atual.aba));
      setVisitadas((atuais) => (atuais.has(atual.aba) ? atuais : new Set(atuais).add(atual.aba)));
    });
  }, []);

  // Limpa quadro e temporizador ao desmontar.
  useEffect(() => {
    return () => {
      if (quadroRolagem.current !== null) window.cancelAnimationFrame(quadroRolagem.current);
      if (timerRolagem.current !== null) window.clearTimeout(timerRolagem.current);
    };
  }, []);

  // O evento nativo de fim de rolagem não existe em todos os navegadores.
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.addEventListener("scrollend", fecharRolagem);
    return () => pager.removeEventListener("scrollend", fecharRolagem);
  }, [fecharRolagem]);

  // Ao redimensionar a janela, reencaixa o paginador na aba ativa.
  useEffect(() => {
    function reencaixar() {
      const pager = pagerRef.current;
      const indice = ABAS.findIndex((item) => item.aba === aba);
      if (pager && indice >= 0) {
        pager.scrollTo({ left: indice * pager.clientWidth, behavior: "auto" });
      }
    }
    window.addEventListener("resize", reencaixar);
    return () => window.removeEventListener("resize", reencaixar);
  }, [aba]);

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const indice = ABAS.findIndex((item) => item.aba === aba);
    const proximo = evento.key === "ArrowRight" ? indice + 1 : indice - 1;
    const item = ABAS[(proximo + ABAS.length) % ABAS.length];
    if (item) trocarAba(item.aba, true);
  }

  function renderizarAba(valor: Aba) {
    return (
      <>
        {valor === "series" && <AbaSeries series={series} onMudanca={onSeriesMudaram} />}
        {valor === "turmas" && (
          <AbaTurmas series={series} turmas={turmas} onMudanca={onTurmasMudaram} />
        )}
        {valor === "alunos" && (
          <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={onAlunosMudaram} />
        )}
        {valor === "equipe" && <AbaEquipe usuarioId={usuarioId} onMudanca={onTurmasMudaram} />}
      </>
    );
  }

  const indiceAtivo = ABAS.findIndex((item) => item.aba === aba);

  return (
    <section aria-label="Gestão da escola" className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gestão</h1>
        <p className="text-muted-foreground text-sm">
          Séries, turmas, alunos e professores da escola.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Áreas de gestão"
        onKeyDown={aoTeclar}
        className="bg-secondary/60 grid grid-cols-4 gap-1 rounded-lg p-1"
      >
        {ABAS.map((item, indice) => {
          const Icone = item.icone;
          const ativo = aba === item.aba;
          return (
            <button
              key={item.aba}
              ref={(elemento) => {
                abasRef.current[indice] = elemento;
              }}
              id={`aba-${item.aba}`}
              type="button"
              role="tab"
              aria-selected={ativo}
              aria-controls={`painel-${item.aba}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => trocarAba(item.aba)}
              className="relative flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-colors sm:flex-row sm:gap-1.5 sm:text-xs"
            >
              {ativo && (
                <motion.span
                  layoutId="indicador-aba"
                  className="bg-background absolute inset-0 rounded-md shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icone
                size={15}
                className={`relative z-10 ${ativo ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span
                className={`relative z-10 ${ativo ? "text-foreground" : "text-muted-foreground"}`}
              >
                {item.rotulo}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div animate={controles} initial={false} className="min-w-0">
        <div
          ref={pagerRef}
          onScroll={aoRolar}
          data-pager="gestao"
          className="pagina-sem-barra flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        >
          {ABAS.map((item, indice) => {
            const ativo = item.aba === aba;
            const distante = Math.abs(indice - indiceAtivo) > 1;
            return (
              <div
                key={item.aba}
                id={`painel-${item.aba}`}
                role="tabpanel"
                aria-labelledby={`aba-${item.aba}`}
                aria-hidden={!ativo}
                inert={!ativo}
                data-distante={distante ? "true" : undefined}
                onPointerDown={() => {
                  rolagemProgramatica.current = false;
                }}
                onWheel={() => {
                  rolagemProgramatica.current = false;
                }}
                className="pagina-painel w-full shrink-0 snap-start"
              >
                {visitadas.has(item.aba) ? renderizarAba(item.aba) : null}
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}
