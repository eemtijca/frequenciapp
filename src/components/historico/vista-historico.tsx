"use client";

// Histórico: frequências salvas de um mês, abertas em um toque.
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Frequencia } from "@/domain/frequencia";
import { horaNoFuso, mesSeguinte, rotuloDiaSemana } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  frequencias: Frequencia[];
  mes: string;
  mesCorrente: string;
  fuso: string;
  onMes: (mes: string) => void;
  onAbrir: (dia: string, turmaId: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
  bloqueado: boolean;
  rotuloTurma: (id: string) => string;
}

function rotuloDia(dia: string): { numero: string; mesAno: string; semana: string } {
  const [ano, mes, diaDoMes] = dia.split("-");
  return {
    numero: diaDoMes ?? "",
    mesAno: `${mes}/${ano}`,
    semana: rotuloDiaSemana(dia).slice(0, 3),
  };
}

export default function VistaHistorico({
  frequencias,
  mes,
  mesCorrente,
  fuso,
  onMes,
  onAbrir,
  onRecarregar,
  bloqueado,
  rotuloTurma,
}: Props) {
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    try {
      await onRecarregar(mes);
    } catch {
      setErro("Não foi possível buscar as frequências.");
    } finally {
      setAtualizando(false);
    }
  }

  const ordenadas = [...frequencias].sort(
    (a, b) =>
      b.dia.localeCompare(a.dia) ||
      rotuloTurma(b.turmaId).localeCompare(rotuloTurma(a.turmaId), "pt-BR"),
  );

  return (
    <section aria-label="Histórico de frequências" className="flex flex-col gap-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Histórico</h1>
          <p className="text-muted-foreground text-sm">
            {frequencias.length === 0
              ? "Frequências salvas do mês"
              : `${frequencias.length} ${frequencias.length === 1 ? "frequência salva" : "frequências salvas"}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Atualizar histórico"
          onClick={atualizar}
          disabled={atualizando}
        >
          {atualizando ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-lg"
          aria-label="Mês anterior"
          onClick={() => onMes(mesSeguinte(mes, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="relative flex-1">
          <label htmlFor="mes-historico" className="sr-only">
            Mês do histórico
          </label>
          <Input
            id="mes-historico"
            type="month"
            value={mes}
            max={mesCorrente}
            onChange={(evento) => {
              if (evento.target.value) onMes(evento.target.value);
            }}
            className="numerais-tabulares h-11 rounded-lg font-medium"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-lg"
          aria-label="Mês seguinte"
          disabled={mes >= mesCorrente}
          onClick={() => onMes(mesSeguinte(mes, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {bloqueado && (
        <p className="bg-secondary text-secondary-foreground rounded-lg px-4 py-3 text-sm">
          Há alterações na frequência em aberto. Salve antes de abrir outra.
        </p>
      )}

      {erro && (
        <p role="alert" className="bg-falta-fraca text-falta-texto rounded-lg px-4 py-3 text-sm">
          {erro}
        </p>
      )}

      {frequencias.length === 0 ? (
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <History size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma frequência neste mês</p>
          <p className="text-muted-foreground text-sm">
            Escolha outro mês ou faça a primeira frequência do período.
          </p>
        </div>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-lg border">
          {ordenadas.map((frequencia) => {
            const rotulo = rotuloDia(frequencia.dia);
            const hora = horaNoFuso(frequencia.atualizadoEm, fuso);
            return (
              <motion.li
                key={`${frequencia.dia}|${frequencia.turmaId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  type="button"
                  disabled={bloqueado}
                  onClick={() => onAbrir(frequencia.dia, frequencia.turmaId)}
                  className="hover:bg-secondary/60 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:scale-[0.99] disabled:opacity-50"
                >
                  <span className="bg-secondary flex size-12 shrink-0 flex-col items-center justify-center rounded-lg leading-none">
                    <span className="numerais-tabulares text-lg font-semibold">
                      {rotulo.numero}
                    </span>
                    <span className="text-muted-foreground text-[10px] uppercase">
                      {rotulo.semana}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      Turma {rotuloTurma(frequencia.turmaId)}
                      <span className="numerais-tabulares text-muted-foreground ml-2 text-xs">
                        {rotulo.mesAno}
                      </span>
                    </span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {frequencia.faltas.length === 0
                        ? "Todos presentes"
                        : `${frequencia.faltas.length} ${frequencia.faltas.length === 1 ? "falta" : "faltas"}`}
                      {hora ? ` · salva às ${hora}` : ""}
                    </span>
                  </span>
                  <ArrowUpRight size={18} className="text-muted-foreground shrink-0" />
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
