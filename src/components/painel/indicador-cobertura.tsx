// Cobertura compacta das chamadas salvas, com progresso circular e turmas pendentes.
import { CheckCircle2, ChevronDown, Clock3, UsersRound } from "lucide-react";
import type { Turma } from "@/domain/frequencia";

interface Props {
  registrados: number;
  esperados: number;
  turmasPendentes: Turma[];
}

export function IndicadorCobertura({ registrados, esperados, turmasPendentes }: Props) {
  const proporcao = esperados > 0 ? Math.min(1, Math.max(0, registrados / esperados)) : 0;
  const progresso =
    esperados > 0 ? Math.min(100, Math.max(0, Math.floor((registrados * 100) / esperados))) : 0;
  const contagem = `${registrados} de ${esperados} alunos com chamada salva`;

  return (
    <div className="superficie-vidro flex items-start gap-3 p-4">
      <div
        role="progressbar"
        aria-label="Alunos com chamada salva"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progresso}
        aria-valuetext={esperados > 0 ? contagem : "Nenhum aluno ativo cadastrado"}
        className="text-primary relative flex size-16 shrink-0 items-center justify-center"
      >
        <svg viewBox="0 0 64 64" aria-hidden="true" className="absolute inset-0 size-full">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            opacity="0.15"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${proporcao * 100} 100`}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span aria-hidden="true" className="numerais-tabulares text-sm font-semibold">
          {progresso}%
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-medium">Cobertura do dia</h2>
        <span
          aria-label={contagem}
          className="text-muted-foreground flex items-center gap-1.5 text-sm"
        >
          <UsersRound aria-hidden="true" className="size-4 shrink-0" />
          <span className="numerais-tabulares">
            {registrados}/{esperados} alunos
          </span>
        </span>
        {esperados === 0 ? (
          <span className="text-muted-foreground text-xs">Sem alunos</span>
        ) : turmasPendentes.length > 0 ? (
          <details className="group">
            <summary className="text-falta-texto focus-visible:ring-ring flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-sm focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <Clock3 aria-hidden="true" className="size-4 shrink-0" />
              <span>
                {turmasPendentes.length}{" "}
                {turmasPendentes.length === 1 ? "turma pendente" : "turmas pendentes"}
              </span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {turmasPendentes.map((turma) => (
                <span
                  key={turma.id}
                  className="bg-falta-fraca text-falta-texto rounded-md px-2 py-1 text-xs font-medium"
                >
                  {turma.rotulo}
                </span>
              ))}
            </div>
          </details>
        ) : (
          <span className="text-primary flex items-center gap-1.5 text-xs">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            Concluída
          </span>
        )}
      </div>
    </div>
  );
}
