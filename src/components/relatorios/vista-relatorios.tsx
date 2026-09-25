"use client";

// Relatórios em sub-abas: Histórico, Grade e Por aluno. Mesmo padrão de
// abas da Gestão, com deslize, toque e teclado.
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { History, Table2, UserRound } from "lucide-react";
import type {
  Aluno,
  Frequencia,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import VistaHistorico from "@/components/historico/vista-historico";
import VistaGrade from "@/components/grade/vista-grade";
import PorAluno from "@/components/relatorios/por-aluno";

export type AbaRelatorio = "historico" | "grade" | "aluno";

interface Props {
  abaInicial?: AbaRelatorio;
  mes: string;
  mesCorrente: string;
  diaCorrente: string;
  fuso: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  resumo: ResumoAcumulado | null;
  versao: number;
  bloqueado: boolean;
  rotuloTurma: (id: string) => string;
  onMes: (mes: string) => void;
  onAbrir: (dia: string, turmaId: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
}

const ABAS: { aba: AbaRelatorio; rotulo: string; icone: typeof History }[] = [
  { aba: "historico", rotulo: "Histórico", icone: History },
  { aba: "grade", rotulo: "Grade", icone: Table2 },
  { aba: "aluno", rotulo: "Por aluno", icone: UserRound },
];

export default function VistaRelatorios({
  abaInicial,
  mes,
  mesCorrente,
  diaCorrente,
  fuso,
  series,
  turmas,
  alunos,
  frequencias,
  saidas,
  resumo,
  versao,
  bloqueado,
  rotuloTurma,
  onMes,
  onAbrir,
  onRecarregar,
}: Props) {
  const inicial = ABAS.some((item) => item.aba === abaInicial)
    ? (abaInicial as AbaRelatorio)
    : "historico";
  const [aba, setAba] = useState<AbaRelatorio>(inicial);
  const [visitadas, setVisitadas] = useState<Set<AbaRelatorio>>(() => new Set([inicial]));
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const abasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceAba = useRef(ABAS.findIndex((item) => item.aba === inicial));
  const rolagemProgramatica = useRef(false);
  const quadroRolagem = useRef<number | null>(null);
  const timerRolagem = useRef<number | null>(null);

  const trocarAba = useCallback((proxima: AbaRelatorio, focar = false) => {
    const indice = ABAS.findIndex((item) => item.aba === proxima);
    if (indice < 0) return;
    if (timerRolagem.current !== null) {
      window.clearTimeout(timerRolagem.current);
      timerRolagem.current = null;
    }
    setAba(proxima);
    setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
    const pager = pagerRef.current;
    if (pager) {
      indiceAba.current = indice;
      rolagemProgramatica.current = true;
      pager.scrollTo({ left: indice * pager.clientWidth, behavior: "smooth" });
      timerRolagem.current = window.setTimeout(() => {
        timerRolagem.current = null;
        rolagemProgramatica.current = false;
      }, 700);
    }
    if (focar) abasRef.current[indice]?.focus();
  }, []);

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
      setVisitadas((atuais) => (atuais.has(atual.aba) ? atuais : new Set(atuais).add(atual.aba)));
      if (rolagemProgramatica.current || indiceAba.current === indice) return;
      indiceAba.current = indice;
      startTransition(() => setAba(atual.aba));
    });
  }, []);

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

  useEffect(() => {
    return () => {
      if (quadroRolagem.current !== null) window.cancelAnimationFrame(quadroRolagem.current);
      if (timerRolagem.current !== null) window.clearTimeout(timerRolagem.current);
    };
  }, []);

  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.addEventListener("scrollend", fecharRolagem);
    return () => pager.removeEventListener("scrollend", fecharRolagem);
  }, [fecharRolagem]);

  useEffect(() => {
    function reencaixar() {
      const pager = pagerRef.current;
      const indice = ABAS.findIndex((item) => item.aba === aba);
      if (pager && indice >= 0) {
        indiceAba.current = indice;
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

  function renderizarAba(valor: AbaRelatorio) {
    const disponivel = valor === aba || visitadas.has(valor);
    if (!disponivel) return null;
    return (
      <>
        {valor === "historico" && (
          <VistaHistorico
            frequencias={frequencias}
            turmas={turmas}
            series={series}
            mes={mes}
            mesCorrente={mesCorrente}
            fuso={fuso}
            onMes={onMes}
            onAbrir={onAbrir}
            onRecarregar={onRecarregar}
            bloqueado={bloqueado}
            rotuloTurma={rotuloTurma}
          />
        )}
        {valor === "grade" && (
          <VistaGrade
            alunos={alunos}
            frequencias={frequencias}
            resumo={resumo}
            mes={mes}
            mesCorrente={mesCorrente}
            hoje={diaCorrente}
            aberto={aba === "grade"}
            versao={versao}
            origens={turmas}
            onMes={onMes}
            onRecarregar={async () => {
              await onRecarregar(mes);
            }}
          />
        )}
        {valor === "aluno" && (
          <PorAluno
            alunos={alunos}
            series={series}
            turmas={turmas}
            frequencias={frequencias}
            saidas={saidas}
            resumo={resumo}
            mes={mes}
            mesCorrente={mesCorrente}
            onMes={onMes}
            onRecarregar={onRecarregar}
          />
        )}
      </>
    );
  }

  const indiceAtivo = ABAS.findIndex((item) => item.aba === aba);

  return (
    <section aria-label="Relatórios" className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm">
          Histórico das chamadas, grade por período e relatório por aluno.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Relatórios"
        onKeyDown={aoTeclar}
        className="bg-secondary/60 grid grid-cols-3 gap-1 rounded-lg p-1"
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
                  layoutId="indicador-relatorio"
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

      <div
        ref={pagerRef}
        onScroll={aoRolar}
        data-pager="relatorios"
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
              className="pagina-painel w-full shrink-0 snap-start"
            >
              {visitadas.has(item.aba) ? renderizarAba(item.aba) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
