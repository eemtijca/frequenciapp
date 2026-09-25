"use client";

// Gestão: área do administrador. Séries, turmas, alunos e professores
// em abas curtas, com formulários mínimos e mensagens claras.
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
        className="bg-secondary/60 grid grid-cols-4 gap-1 rounded-lg p-1"
      >
        {ABAS.map((item) => {
          const Icone = item.icone;
          const ativo = aba === item.aba;
          return (
            <button
              key={item.aba}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setAba(item.aba)}
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

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={aba}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {aba === "series" && <AbaSeries series={series} onMudanca={onSeriesMudaram} />}
          {aba === "turmas" && (
            <AbaTurmas series={series} turmas={turmas} onMudanca={onTurmasMudaram} />
          )}
          {aba === "alunos" && (
            <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={onAlunosMudaram} />
          )}
          {aba === "equipe" && <AbaEquipe usuarioId={usuarioId} onMudanca={onTurmasMudaram} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
