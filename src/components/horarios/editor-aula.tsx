"use client";

// Rascunho de uma aula na grade, com campos acessíveis e gravação solicitada pelo formulário.
import { useEffect, useRef } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";

export interface RascunhoAula {
  aulaId: string;
  turmaId: string;
  turmaRotulo: string;
  ordem: number;
  dia: number | null;
  disciplina: string;
  disciplinaInicial: string;
  inicio: string;
  inicioInicial: string;
  fim: string;
  fimInicial: string;
}

interface Props {
  rascunho: RascunhoAula;
  identificador: string;
  rotuloDia: string;
  ocupado: boolean;
  somenteLeitura?: boolean;
  alterado: boolean;
  erro: string;
  erroVariante: VarianteEstado;
  onAlterar: (rascunho: RascunhoAula) => void;
  onSalvar: () => void;
  onCancelar: () => void;
}

export function EditorAula({
  rascunho,
  identificador,
  rotuloDia,
  ocupado,
  somenteLeitura = false,
  alterado,
  erro,
  erroVariante,
  onAlterar,
  onSalvar,
  onCancelar,
}: Props) {
  const formulario = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    // A grade e a lista compartilham o rascunho; apenas a versão visível recebe o foco.
    if (!formulario.current?.getClientRects().length) return;
    formulario.current
      .querySelector<HTMLInputElement | HTMLButtonElement>(
        "input:not(:disabled), button:not(:disabled)",
      )
      ?.focus({ preventScroll: true });
  }, []);

  return (
    <form
      ref={formulario}
      aria-label={`Editar ${rascunho.ordem}ª aula${rascunho.dia ? ` de ${rotuloDia}` : ""}`}
      aria-busy={ocupado}
      className="bg-secondary/30 flex min-w-0 flex-col gap-4 rounded-2xl border p-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!ocupado && !somenteLeitura && alterado) onSalvar();
      }}
    >
      <h3 className="text-sm font-semibold">
        {rascunho.ordem}ª aula{rascunho.dia ? ` · ${rotuloDia}` : " · Horário"}
      </h3>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {rascunho.dia !== null ? (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${identificador}-disciplina`}>Disciplina</Label>
            <Input
              id={`${identificador}-disciplina`}
              value={rascunho.disciplina}
              maxLength={80}
              disabled={ocupado || somenteLeitura}
              placeholder="Sem disciplina"
              autoComplete="off"
              onChange={(evento) => onAlterar({ ...rascunho, disciplina: evento.target.value })}
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${identificador}-inicio`}>Início</Label>
          <SeletorHorario
            id={`${identificador}-inicio`}
            valor={rascunho.inicio}
            disabled={ocupado || somenteLeitura}
            rotuloAcessivel="Início da aula"
            onValor={(inicio) => onAlterar({ ...rascunho, inicio })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${identificador}-fim`}>Fim</Label>
          <SeletorHorario
            id={`${identificador}-fim`}
            valor={rascunho.fim}
            disabled={ocupado || somenteLeitura}
            rotuloAcessivel="Fim da aula"
            onValor={(fim) => onAlterar({ ...rascunho, fim })}
          />
        </div>
      </div>
      {erro ? (
        <AvisoCompacto
          variante={erroVariante}
          titulo={erro}
          descricao="As alterações continuam no formulário."
          tamanho="linha"
        />
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={ocupado || somenteLeitura || !alterado}>
          <Save size={16} aria-hidden="true" />
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
