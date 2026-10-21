"use client";

// Botão de alerta na linha do aluno da Chamada: faltas do mês acima do limite de algum benefício, com o detalhe em painel.
import { TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";

interface Props {
  nome: string;
  alertas: AlertaFrequenciaBeneficio[];
}

function quantidade(valor: number, singular: string, plural: string): string {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

export function AvisoBeneficioFrequencia({ nome, alertas }: Props) {
  const beneficios = alertas.map((alerta) => alerta.beneficioNome).join(", ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Atenção: ${nome} passou do limite de faltas do mês. ${beneficios}.`}
          title={`Acima do limite de faltas: ${beneficios}`}
          className="border-alerta/50 bg-alerta-fraca text-alerta-texto pressionavel focus-visible:ring-ring/50 relative z-10 inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border px-1.5 outline-none before:absolute before:-inset-2 focus-visible:ring-[3px]"
        >
          <TriangleAlert size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3 text-sm">
        {alertas.map((alerta) => (
          <div key={alerta.beneficioId} className="space-y-1">
            <p className="font-semibold">{alerta.beneficioNome}</p>
            <p>
              {quantidade(alerta.aulasFaltadas, "aula com falta", "aulas com falta")} em{" "}
              {quantidade(alerta.horasLetivas, "aula prevista", "aulas previstas")} no mês. Para
              manter {alerta.percentualMinimoFrequencia}% de frequência, o limite é de{" "}
              {quantidade(alerta.limiteFaltas, "aula com falta", "aulas com falta")}.
            </p>
            {alerta.aulasJustificadas > 0 && (
              <p className="text-muted-foreground text-xs">
                {quantidade(
                  alerta.aulasJustificadas,
                  "aula com falta justificada",
                  "aulas com falta justificada",
                )}{" "}
                {alerta.faltasJustificadasContam ? "incluída" : "desconsiderada"}
                {alerta.aulasJustificadas === 1 ? "" : "s"} conforme a configuração do benefício.
              </p>
            )}
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          Estimativa mensal com chamadas salvas e grade dos dias sem chamada. Os contadores F e FJ
          da linha contam dias. Este alerta não determina o pagamento do benefício.
        </p>
      </PopoverContent>
    </Popover>
  );
}
