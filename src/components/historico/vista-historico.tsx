"use client";

// Histórico: frequências salvas de um mês, abertas em um toque.
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Frequencia, Serie, Turma } from "@/domain/frequencia";
import {
  horaNoFuso,
  horariosDoDia,
  mesSeguinte,
  normalizar,
  rotuloDiaSemana,
  rotuloMes,
} from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { BarraBusca } from "@/components/ui/barra-busca";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface Props {
  frequencias: Frequencia[];
  turmas: Turma[];
  series: Serie[];
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
  turmas,
  series,
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
  const semMovimento = useReducedMotion() ?? false;
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [serieFiltro, setSerieFiltro] = useState("");

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
  const termo = normalizar(busca);
  const serieDaTurma = new Map(turmas.map((turma) => [turma.id, turma.serieId]));
  const filtradas = ordenadas.filter((frequencia) => {
    if (serieFiltro && serieDaTurma.get(frequencia.turmaId) !== serieFiltro) return false;
    if (termo === "") return true;
    const alvo = normalizar(
      `${rotuloTurma(frequencia.turmaId)} ${frequencia.dia} ${frequencia.atualizadoPorNome ?? ""}`,
    );
    return alvo.includes(termo);
  });

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
          className="size-11 shrink-0 rounded-lg"
          aria-label="Mês anterior"
          onClick={() => onMes(mesSeguinte(mes, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="mes-historico"
            modo="mes"
            valor={mes}
            max={mesCorrente}
            rotuloAcessivel="Mês do histórico"
            rotulo={rotuloMes(mes)}
            onValor={onMes}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label="Mês seguinte"
          disabled={mes >= mesCorrente}
          onClick={() => onMes(mesSeguinte(mes, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {mes !== mesCorrente && (
        <button
          type="button"
          onClick={() => onMes(mesCorrente)}
          className="text-primary pressionavel self-start text-sm font-medium hover:underline"
        >
          Voltar para este mês
        </button>
      )}

      {series.length > 0 && (
        <div role="group" aria-label="Filtrar por série" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={serieFiltro === ""}
            onClick={() => setSerieFiltro("")}
            className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground pressionavel flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            Todas
          </button>
          {series.map((serie) => (
            <button
              key={serie.id}
              type="button"
              aria-pressed={serieFiltro === serie.id}
              onClick={() => setSerieFiltro(serie.id)}
              className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground pressionavel flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
            >
              {serie.nome}
            </button>
          ))}
        </div>
      )}

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
        <div className="flex flex-col gap-3">
          <BarraBusca
            id="busca-historico"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar por turma, dia ou autoria"
          />
          {filtradas.length === 0 ? (
            <div className="bg-card flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border px-6 text-center">
              <p className="font-medium">Nenhuma frequência encontrada</p>
              <p className="text-muted-foreground text-sm">Tente outro termo de busca.</p>
            </div>
          ) : (
            <ul className="bg-card divide-y overflow-hidden rounded-lg border">
              {filtradas.map((frequencia) => {
                const rotulo = rotuloDia(frequencia.dia);
                const hora = horaNoFuso(frequencia.atualizadoEm, fuso);
                const turma = turmas.find((item) => item.id === frequencia.turmaId);
                const aulasDoDia = horariosDoDia(turma?.horarios ?? [], frequencia.dia);
                const parciais = frequencia.faltas.filter(
                  (falta) => aulasDoDia.length > 0 && falta.horarios.length < aulasDoDia.length,
                ).length;
                const justificadas = frequencia.faltas.filter(
                  (falta) => falta.justificativa,
                ).length;
                const resumo =
                  frequencia.faltas.length === 0
                    ? "Todos presentes"
                    : `${frequencia.faltas.length} ${
                        frequencia.faltas.length === 1 ? "falta" : "faltas"
                      }${
                        justificadas > 0
                          ? ` · ${justificadas} ${
                              justificadas === 1 ? "justificada" : "justificadas"
                            }`
                          : ""
                      }${
                        parciais > 0
                          ? ` · ${parciais} ${parciais === 1 ? "saída parcial" : "saídas parciais"}`
                          : ""
                      }`;
                const autoria = hora
                  ? ` · salva às ${hora}${frequencia.atualizadoPorNome ? ` por ${frequencia.atualizadoPorNome}` : ""}`
                  : "";
                return (
                  <motion.li
                    key={`${frequencia.dia}|${frequencia.turmaId}`}
                    initial={semMovimento ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={
                      semMovimento ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                    }
                    className="last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)]"
                  >
                    <button
                      type="button"
                      disabled={bloqueado}
                      onClick={() => onAbrir(frequencia.dia, frequencia.turmaId)}
                      className="hover:bg-secondary/60 pressionavel flex w-full items-center gap-3 px-4 py-3 text-left transition-colors disabled:opacity-50"
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
                          {resumo}
                          {autoria}
                        </span>
                      </span>
                      <ArrowUpRight size={18} className="text-muted-foreground shrink-0" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
