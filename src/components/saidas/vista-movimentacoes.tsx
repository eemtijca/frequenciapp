"use client";

// Área compartilhada de saídas e entradas, com registros independentes.
import { useState, type ComponentProps } from "react";
import VistaSaidas from "./vista-saidas";
import VistaEntradas from "./vista-entradas";
import { Button } from "@/components/ui/button";

type Props = ComponentProps<typeof VistaSaidas> & { podePrepararPlanilha: boolean };

export default function VistaMovimentacoes({ podePrepararPlanilha, ...props }: Props) {
  const [tipo, setTipo] = useState<"saidas" | "entradas">("saidas");
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Tipo de registro" className="flex gap-2">
        <Button
          variant={tipo === "saidas" ? "default" : "outline"}
          aria-pressed={tipo === "saidas"}
          onClick={() => setTipo("saidas")}
        >
          Saídas
        </Button>
        <Button
          variant={tipo === "entradas" ? "default" : "outline"}
          aria-pressed={tipo === "entradas"}
          onClick={() => setTipo("entradas")}
        >
          Entradas
        </Button>
      </div>
      <div hidden={tipo !== "saidas"}>
        <VistaSaidas {...props} ativo={props.ativo && tipo === "saidas"} />
      </div>
      {tipo === "entradas" && (
        <VistaEntradas
          diaCorrente={props.diaCorrente}
          fuso={props.fuso}
          turmas={props.turmas}
          alunos={props.alunos}
          podePrepararPlanilha={podePrepararPlanilha}
        />
      )}
    </div>
  );
}
