"use client";

// Alunos: lista de consulta do professor, agrupada por turma. O
// cadastro e a edição acontecem na área de Gestão do administrador.
import { useMemo } from "react";
import { motion } from "motion/react";
import { UserRound, Users } from "lucide-react";
import type { Aluno, Turma } from "@/domain/frequencia";

interface Props {
  alunos: Aluno[];
  turmas: Turma[];
}

export default function VistaAlunos({ alunos, turmas }: Props) {
  const origem = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string, fallback: string) => mapa.get(id) ?? fallback;
  }, [turmas]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { turma: Turma | undefined; alunos: Aluno[] }>();
    for (const aluno of alunos) {
      const item = mapa.get(aluno.turmaId) ?? {
        turma: turmas.find((t) => t.id === aluno.turmaId),
        alunos: [],
      };
      item.alunos.push(aluno);
      mapa.set(aluno.turmaId, item);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[1].turma?.rotulo ?? "").localeCompare(b[1].turma?.rotulo ?? "", "pt-BR"))
      .map(
        ([id, item]) =>
          [id, item.turma, item.alunos.slice().sort((a, b) => a.ordem - b.ordem)] as const,
      );
  }, [alunos, turmas]);

  const ativos = alunos.filter((aluno) => aluno.ativo).length;

  return (
    <section aria-label="Lista de alunos" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alunos</h1>
          <p className="text-muted-foreground text-sm">
            {alunos.length} no total · {ativos} ativos
          </p>
        </div>
        <Users size={22} className="text-muted-foreground" aria-hidden="true" />
      </div>

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        Lista de consulta das suas turmas. Inclusões, mudanças de turma e desligamentos são feitos
        pelo administrador da escola, na área de Gestão.
      </p>

      {alunos.length === 0 ? (
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum aluno nas suas turmas</p>
          <p className="text-muted-foreground text-sm">
            Peça ao administrador para cadastrar os alunos e atribuir as turmas a você.
          </p>
        </div>
      ) : (
        grupos.map(([id, turma, lista]) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card overflow-hidden rounded-lg border"
          >
            <div className="bg-secondary/50 flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="font-medium">{turma?.rotulo ?? "Turma"}</h2>
              <span className="numerais-tabulares text-muted-foreground text-xs">
                {lista.filter((aluno) => aluno.ativo).length} ativos
              </span>
            </div>
            <ul className="divide-y">
              {lista.map((aluno) => (
                <li
                  key={aluno.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${aluno.ativo ? "" : "opacity-55"}`}
                >
                  <span className="numerais-tabulares text-muted-foreground w-7 shrink-0 text-sm">
                    {String(aluno.ordem).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{aluno.nome}</p>
                    {aluno.turmaOriginalId !== aluno.turmaId && (
                      <p className="text-muted-foreground text-xs">
                        Origem {origem(aluno.turmaOriginalId, "outra turma")}
                      </p>
                    )}
                  </div>
                  {!aluno.ativo && (
                    <span className="text-muted-foreground text-xs">desativado</span>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        ))
      )}
    </section>
  );
}
