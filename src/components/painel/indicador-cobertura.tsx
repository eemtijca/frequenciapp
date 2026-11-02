// Cobertura das chamadas com barra ponderada pelos alunos e pendências por turma.
import { CheckCircle2, ChevronDown, Clock3 } from "lucide-react";
import { useId } from "react";
import type { CoberturaTurmaDia } from "@/domain/relatorios";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { CartaoIndicador } from "@/components/ui/cartao-indicador";
import { IndicadorFeriado } from "@/components/painel/indicador-feriado";

interface Props {
  turmas: CoberturaTurmaDia[];
  feriado?: string;
}

export function IndicadorCobertura({ turmas, feriado }: Props) {
  const descricaoId = useId();
  if (feriado) {
    return (
      <CartaoIndicador titulo="Cobertura do dia" rotuloAcessivel="Cobertura do dia">
        <IndicadorFeriado nome={feriado} />
        <span className="sr-only">Não há chamadas pendentes nesta data.</span>
      </CartaoIndicador>
    );
  }
  const esperados = turmas.reduce((total, item) => total + item.esperados, 0);
  const registrados = turmas.reduce(
    (total, item) => total + (item.concluida ? item.esperados : 0),
    0,
  );
  const turmasPendentes = turmas.filter((item) => !item.concluida).map((item) => item.turma);
  const progresso =
    esperados > 0 ? Math.min(100, Math.max(0, Math.floor((registrados * 100) / esperados))) : 0;
  const contagem = `${registrados} de ${esperados} alunos com chamada salva`;

  return (
    <CartaoIndicador titulo="Cobertura do dia" rotuloAcessivel="Cobertura do dia">
      <div className="flex flex-col gap-2">
        <span
          aria-hidden="true"
          className="numerais-tabulares text-primary text-3xl font-semibold sm:text-4xl"
        >
          {progresso}%
        </span>
        <BarraProgresso
          valor={progresso}
          rotulo="Alunos com chamada salva"
          descricao={esperados > 0 ? contagem : "Nenhum aluno ativo cadastrado"}
          descritoPor={esperados > 0 ? descricaoId : undefined}
          testId="cobertura-preenchida"
        />
        <p id={descricaoId} className="sr-only">
          {turmas
            .map((item) => `${item.turma.rotulo}: ${item.concluida ? "concluída" : "pendente"}`)
            .join("; ")}
        </p>
        {esperados === 0 ? (
          <span className="text-muted-foreground text-xs">Sem alunos</span>
        ) : turmasPendentes.length === 0 ? (
          <span className="text-primary flex items-center gap-1.5 text-xs">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            Concluída
          </span>
        ) : null}
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
    </CartaoIndicador>
  );
}
