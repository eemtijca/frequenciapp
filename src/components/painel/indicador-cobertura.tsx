// Cobertura das chamadas por turma em fatias verdes e vermelhas, ponderadas pelos alunos.
import { CalendarOff, CheckCircle2, ChevronDown, Clock3, UsersRound } from "lucide-react";
import { useId } from "react";
import type { CoberturaTurmaDia } from "@/domain/relatorios";

interface Props {
  turmas: CoberturaTurmaDia[];
  feriado?: string;
}

export function IndicadorCobertura({ turmas, feriado }: Props) {
  const descricaoId = useId();
  if (feriado) {
    return (
      <div
        role="group"
        aria-label="Cobertura do dia"
        className="superficie-vidro flex flex-col justify-between gap-2 p-3.5 sm:px-5 sm:py-4"
      >
        <h2 className="text-sm font-medium sm:text-base">Cobertura do dia</h2>
        <div className="flex items-center gap-2.5">
          <div className="text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full border sm:size-14">
            <CalendarOff aria-hidden="true" className="size-5" />
          </div>
          <span className="text-muted-foreground text-xs break-words sm:text-sm">{feriado}</span>
          <span className="sr-only">Não há chamadas pendentes nesta data.</span>
        </div>
      </div>
    );
  }
  const esperados = turmas.reduce((total, item) => total + item.esperados, 0);
  const registrados = turmas.reduce(
    (total, item) => total + (item.concluida ? item.esperados : 0),
    0,
  );
  const turmasPendentes = turmas.filter((item) => !item.concluida).map((item) => item.turma);
  const concluida = esperados > 0 && turmasPendentes.length === 0;
  let inicio = 0;
  const fatias = turmas.map((item) => {
    const tamanho = (item.esperados * 100) / esperados;
    const intervalo = turmas.length > 1 ? Math.min(0.8, tamanho / 8) : 0;
    const fatia = { ...item, inicio: inicio + intervalo / 2, tamanho: tamanho - intervalo };
    inicio += tamanho;
    return fatia;
  });
  const progresso =
    esperados > 0 ? Math.min(100, Math.max(0, Math.floor((registrados * 100) / esperados))) : 0;
  const contagem = `${registrados} de ${esperados} alunos com chamada salva`;

  return (
    <div
      role="group"
      aria-label="Cobertura do dia"
      className="superficie-vidro flex flex-col justify-between gap-2 p-3.5 sm:px-5 sm:py-4"
    >
      <h2 className="text-sm font-medium sm:text-base">Cobertura do dia</h2>
      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label="Alunos com chamada salva"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progresso}
          aria-valuetext={esperados > 0 ? contagem : "Nenhum aluno ativo cadastrado"}
          aria-describedby={esperados > 0 ? descricaoId : undefined}
          className="text-primary relative flex size-12 shrink-0 items-center justify-center sm:size-14"
        >
          <svg viewBox="0 0 64 64" aria-hidden="true" className="absolute inset-0 size-full">
            {esperados === 0 || concluida ? (
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className={concluida ? "text-primary" : "text-muted-foreground opacity-15"}
              />
            ) : (
              fatias.map((fatia) => (
                <circle
                  key={fatia.turma.id}
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  pathLength="100"
                  strokeDasharray={`${fatia.tamanho} ${100 - fatia.tamanho}`}
                  strokeDashoffset={-fatia.inicio}
                  transform="rotate(-90 32 32)"
                  className={fatia.concluida ? "text-primary" : "text-falta-texto"}
                >
                  <title>{`${fatia.turma.rotulo}: ${fatia.concluida ? "chamada concluída" : "chamada pendente"}`}</title>
                </circle>
              ))
            )}
          </svg>
          <span aria-hidden="true" className="numerais-tabulares text-sm font-semibold">
            {progresso}%
          </span>
        </div>
        <p id={descricaoId} className="sr-only">
          {turmas
            .map((item) => `${item.turma.rotulo}: ${item.concluida ? "concluída" : "pendente"}`)
            .join("; ")}
        </p>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            aria-label={contagem}
            className="text-muted-foreground flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <UsersRound aria-hidden="true" className="size-4 shrink-0" />
            <span className="numerais-tabulares">
              {registrados}/{esperados} alunos
            </span>
          </span>
          {esperados === 0 ? (
            <span className="text-muted-foreground text-xs">Sem alunos</span>
          ) : turmasPendentes.length === 0 ? (
            <span className="text-primary flex items-center gap-1.5 text-xs">
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
              Concluída
            </span>
          ) : null}
        </div>
      </div>
      {esperados > 0 && turmasPendentes.length > 0 && (
        <details className="group">
          <summary className="text-falta-texto focus-visible:ring-ring -mx-1 flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-full px-1 text-xs focus-visible:ring-2 focus-visible:outline-none sm:gap-1.5 sm:px-2 sm:text-sm [&::-webkit-details-marker]:hidden">
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
      )}
    </div>
  );
}
