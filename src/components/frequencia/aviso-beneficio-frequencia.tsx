"use client";

// Alerta de benefício na Chamada: resumo curto e números em linhas separadas.
import { TriangleAlert } from "lucide-react";
import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";
import {
  frasesDoAlerta,
  RODAPE_ALERTA_BENEFICIO,
} from "@/components/frequencia/frases-aviso-beneficio";

interface Props {
  nome: string;
  alertas: AlertaFrequenciaBeneficio[];
}

const percentual = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function AvisoBeneficioFrequencia({ nome, alertas }: Props) {
  const tituloId = useId();
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
      <PopoverContent
        align="start"
        collisionPadding={8}
        aria-labelledby={tituloId}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto p-0 text-sm"
      >
        <div className="border-b px-4 py-3">
          <p id={tituloId} className="font-semibold">
            {alertas.length === 1 ? alertas[0]?.beneficioNome : "Benefícios"}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {alertas.length === 1 ? "Limite mensal de faltas" : beneficios}
          </p>
        </div>
        <div className="divide-y">
          {alertas.map((alerta) => {
            const frases = frasesDoAlerta(alerta);
            const numeros = frases.numeros;
            return (
              <div key={alerta.beneficioId} className="space-y-3 px-4 py-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">Frequência estimada</p>
                    <p className="numerais-tabulares text-2xl font-semibold">
                      {percentual.format(numeros.frequencia)}%
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Mínimo {numeros.percentualMinimo}%
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-secondary/60 rounded-lg px-2.5 py-2">
                    <dt className="text-muted-foreground">Faltas</dt>
                    <dd className="numerais-tabulares mt-0.5 font-medium">
                      {numeros.aulasFaltadas} de {numeros.horasLetivas} aulas
                    </dd>
                  </div>
                  <div className="bg-secondary/60 rounded-lg px-2.5 py-2">
                    <dt className="text-muted-foreground">Limite</dt>
                    <dd className="numerais-tabulares mt-0.5 font-medium">
                      {numeros.limiteFaltas} {numeros.limiteFaltas === 1 ? "aula" : "aulas"}
                    </dd>
                  </div>
                </dl>
                <p
                  className={
                    numeros.resto < 0
                      ? "text-falta-texto text-xs font-medium"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {frases.margem}
                </p>
                {frases.justificadas ? (
                  <p className="text-muted-foreground text-xs">{frases.justificadas}</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground border-t px-4 py-2.5 text-xs">
          {RODAPE_ALERTA_BENEFICIO}
        </p>
      </PopoverContent>
    </Popover>
  );
}
