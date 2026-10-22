"use client";

// Botão de alerta na linha do aluno da Chamada: faltas do mês acima do limite de algum benefício, com o detalhe em painel.
import { TriangleAlert } from "lucide-react";
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
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-1.5rem)] space-y-3 p-3 text-sm"
      >
        {alertas.map((alerta) => {
          const frases = frasesDoAlerta(alerta);
          return (
            <div key={alerta.beneficioId} className="space-y-1">
              <p className="font-semibold">{alerta.beneficioNome}</p>
              <p>{frases.faltas}</p>
              <p>{frases.limite}</p>
              <p>{frases.margem}</p>
              <p>{frases.frequencia}</p>
              {frases.justificadas ? (
                <p className="text-muted-foreground text-xs">{frases.justificadas}</p>
              ) : null}
              {frases.carga ? (
                <p className="text-muted-foreground text-xs">{frases.carga}</p>
              ) : null}
            </div>
          );
        })}
        <p className="text-muted-foreground text-xs">{RODAPE_ALERTA_BENEFICIO}</p>
      </PopoverContent>
    </Popover>
  );
}
