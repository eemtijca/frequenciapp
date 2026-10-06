"use client";

// Seletor de série e turma da Chamada com acabamento de vidro e seleção acessível.
// A série ativa é sempre a da turma escolhida; trocar a aparência não altera o registro.
import { useId, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Aluno, Turma } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import estilos from "./seletor-turma-chamada.module.css";

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
  const id = useId();
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
    <div role="group" aria-label="Turma atual" className="flex flex-col gap-3">
      <div
        className={cn(
          "superficie-vidro grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1",
          estilos.faixa,
        )}
      >
        {series.map((grupo) => {
          const ehAtiva = grupo.id === ativa?.id;
          const total = grupo.turmas.reduce(
            (soma, opcao) => soma + (contagem.get(opcao.id) ?? 0),
            0,
          );
          return (
            <Button
              key={grupo.id}
              type="button"
              variant="ghost"
              aria-label={grupo.nome}
              aria-describedby={`${id}-serie-${grupo.id}`}
              aria-pressed={ehAtiva}
              aria-expanded={ehAtiva ? !recolhido : undefined}
              aria-controls={ehAtiva ? `${id}-turmas` : undefined}
              disabled={travado && !ehAtiva}
              onClick={() => aoTocarSerie(grupo.id)}
              className={cn(estilos.serie, ehAtiva && "vidro-selecionado")}
            >
              <span className="flex w-full min-w-0 items-center justify-center gap-1">
                <span className="truncate font-semibold" title={grupo.nome}>
                  {grupo.nome}
                </span>
                {ehAtiva && (
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                      !recolhido && "rotate-180",
                    )}
                  />
                )}
              </span>
              <span
                id={`${id}-serie-${grupo.id}`}
                className="text-muted-foreground text-xs leading-4 tabular-nums"
              >
                {total} {total === 1 ? "aluno" : "alunos"}
              </span>
            </Button>
          );
        })}
      </div>

      {ativa && !recolhido && (
        <motion.div
          key={ativa.id}
          id={`${id}-turmas`}
          role="group"
          aria-label={`Turmas de ${ativa.nome}`}
          initial={reduzir ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2"
        >
          {ativa.turmas.map((opcao) => {
            const ativo = opcao.id === turmaId;
            const total = contagem.get(opcao.id) ?? 0;
            return (
              <Button
                key={opcao.id}
                type="button"
                variant="outline"
                aria-label={opcao.rotulo}
                aria-describedby={`${id}-turma-${opcao.id}`}
                aria-pressed={ativo}
                disabled={travado}
                onClick={() => onEscolher(opcao.id)}
                className={estilos.turma}
              >
                <span className="flex w-full min-w-0 items-center justify-between gap-1">
                  <span className="truncate text-base leading-5 font-semibold" title={opcao.rotulo}>
                    {opcao.nome}
                  </span>
                  {ativo && (
                    <span className={estilos.confirmacao} aria-hidden="true">
                      <Check className="size-3 shrink-0" strokeWidth={2.5} />
                    </span>
                  )}
                </span>
                <span
                  id={`${id}-turma-${opcao.id}`}
                  className="text-muted-foreground text-xs leading-4 tabular-nums"
                >
                  {total} {total === 1 ? "aluno" : "alunos"}
                </span>
              </Button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
