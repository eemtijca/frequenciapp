"use client";

// Seletor de série e turma da Chamada: controle segmentado de séries com as turmas
// da série ativa logo abaixo. A série ativa é sempre a da turma escolhida.
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Aluno, Turma } from "@/domain/frequencia";
import { cn } from "@/lib/utils";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  turmaId: string;
  /** Bloqueia a troca (alterações por salvar, carregamento ou salvamento). */
  travado: boolean;
  onEscolher: (turmaId: string) => void;
}

export function SeletorTurmaChamada({ turmas, alunos, turmaId, travado, onEscolher }: Props) {
  const reduzir = useReducedMotion();
  const [recolhido, setRecolhido] = useState(false);

  const series = useMemo(() => {
    const grupos: { id: string; nome: string; turmas: Turma[] }[] = [];
    for (const opcao of turmas) {
      const existente = grupos.find((grupo) => grupo.id === opcao.serieId);
      if (existente) existente.turmas.push(opcao);
      else grupos.push({ id: opcao.serieId, nome: opcao.serieNome, turmas: [opcao] });
    }
    return grupos;
  }, [turmas]);

  const contagem = useMemo(() => {
    const porTurma = new Map<string, number>();
    for (const aluno of alunos) {
      if (aluno.ativo) porTurma.set(aluno.turmaId, (porTurma.get(aluno.turmaId) ?? 0) + 1);
    }
    return porTurma;
  }, [alunos]);

  const ativa = series.find((grupo) => grupo.turmas.some((opcao) => opcao.id === turmaId));

  function aoTocarSerie(grupoId: string) {
    if (grupoId === ativa?.id) {
      setRecolhido((atual) => !atual);
      return;
    }
    const primeira = series.find((grupo) => grupo.id === grupoId)?.turmas[0];
    if (!primeira) return;
    setRecolhido(false);
    onEscolher(primeira.id);
  }

  return (
    <div role="group" aria-label="Turma atual" className="flex flex-col gap-2">
      <div className="bg-secondary/50 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1 rounded-xl border p-1">
        {series.map((grupo) => {
          const ehAtiva = grupo.id === ativa?.id;
          const total = grupo.turmas.reduce(
            (soma, opcao) => soma + (contagem.get(opcao.id) ?? 0),
            0,
          );
          return (
            <button
              key={grupo.id}
              type="button"
              aria-label={grupo.nome}
              aria-pressed={ehAtiva}
              aria-expanded={ehAtiva ? !recolhido : undefined}
              aria-controls={ehAtiva ? "turmas-da-serie-ativa" : undefined}
              disabled={travado && !ehAtiva}
              onClick={() => aoTocarSerie(grupo.id)}
              className={cn(
                "pressionavel flex h-11 min-w-0 flex-col items-center justify-center rounded-lg border border-transparent px-2 text-sm font-medium transition-colors disabled:opacity-50",
                ehAtiva
                  ? "border-primary bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex w-full min-w-0 items-center justify-center gap-1">
                <span className="truncate">{grupo.nome}</span>
                {ehAtiva && (
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 transition-transform motion-reduce:transition-none",
                      !recolhido && "rotate-180",
                    )}
                  />
                )}
              </span>
              <span className="numerais-tabulares text-[11px] leading-none opacity-70">
                {total} {total === 1 ? "aluno" : "alunos"}
              </span>
            </button>
          );
        })}
      </div>

      {ativa && !recolhido && (
        <motion.div
          key={ativa.id}
          id="turmas-da-serie-ativa"
          role="group"
          aria-label={`Turmas de ${ativa.nome}`}
          initial={reduzir ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2"
        >
          {ativa.turmas.map((opcao) => {
            const ativo = opcao.id === turmaId;
            return (
              <button
                key={opcao.id}
                type="button"
                aria-label={opcao.rotulo}
                aria-pressed={ativo}
                disabled={travado}
                onClick={() => onEscolher(opcao.id)}
                className={cn(
                  "pressionavel flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50",
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-secondary",
                )}
              >
                <span className="truncate">{opcao.nome}</span>
                <span className="numerais-tabulares text-xs opacity-70">
                  {contagem.get(opcao.id) ?? 0}
                </span>
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
