"use client";

// Relatório por aluno no mês: faltas, faltas justificadas, saídas e dias
// com registro, com o acumulado de todo o histórico.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, UserRound } from "lucide-react";
import type {
  Aluno,
  Frequencia,
  Horario,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import {
  diasDoMes,
  marcaDoAluno,
  mesSeguinte,
  normalizar,
  rotuloJustificativa,
  rotuloMes,
  rotuloMomento,
} from "@/domain/frequencia";
import { indexarPorDia, resumoPorAluno } from "@/domain/relatorios";
import { Button } from "@/components/ui/button";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface Props {
  alunos: Aluno[];
  series: Serie[];
  turmas: Turma[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  resumo: ResumoAcumulado | null;
  mes: string;
  mesCorrente: string;
  onMes: (mes: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
}

interface DetalheProps {
  aluno: Aluno;
  dias: string[];
  porDia: Map<string, Frequencia[]>;
  horarios: Horario[];
  saidas: SaidaAntecipada[];
}

/** Detalhe do aluno: marcas do mês e saídas antecipadas. */
function DetalheAluno({ aluno, dias, porDia, horarios, saidas }: DetalheProps) {
  const marcas = dias
    .map((dia) => ({ dia, marca: marcaDoAluno(aluno, dia, porDia.get(dia) ?? [], horarios) }))
    .filter((item) => item.marca !== null);
  const saidasDoAluno = saidas.filter((saida) => saida.alunoId === aluno.id);
  if (marcas.length === 0 && saidasDoAluno.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum registro neste mês.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {marcas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {marcas.map(({ dia, marca }) => (
            <span
              key={dia}
              className={`numerais-tabulares inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                marca === "F"
                  ? "border-falta/40 bg-falta-fraca text-falta-texto"
                  : marca === "FJ"
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : marca === "S"
                      ? "border-falta/40 text-falta-texto"
                      : "text-muted-foreground"
              }`}
            >
              {dia.slice(8)}/{dia.slice(5, 7)}
              <strong>{marca}</strong>
            </span>
          ))}
        </div>
      )}
      {saidasDoAluno.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {saidasDoAluno.map((saida) => (
            <li key={saida.id} className="text-muted-foreground">
              <span className="numerais-tabulares text-foreground font-medium">
                {saida.dia.split("-").reverse().join("/")}
              </span>
              {": "}
              {rotuloMomento(saida.momento)} · {rotuloJustificativa(saida.justificativa)}
              {saida.texto ? ` · ${saida.texto}` : saida.observacao ? ` · ${saida.observacao}` : ""}
              {saida.liberadoPorNome ? ` · liberado por ${saida.liberadoPorNome}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PorAluno({
  alunos,
  series,
  turmas,
  frequencias,
  saidas,
  resumo,
  mes,
  mesCorrente,
  onMes,
  onRecarregar,
}: Props) {
  const [busca, setBusca] = useState("");
  const [serieFiltro, setSerieFiltro] = useState("");
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const rotuloTurma = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Sem turma";
  }, [turmas]);

  const turmaSerie = useMemo(
    () => new Map(turmas.map((turma) => [turma.id, turma.serieId])),
    [turmas],
  );

  const acumuladoDe = useMemo(() => {
    const mapa = new Map((resumo?.porAluno ?? []).map((item) => [item.alunoId, item]));
    return (alunoId: string) => mapa.get(alunoId) ?? null;
  }, [resumo]);

  const dias = useMemo(() => diasDoMes(mes), [mes]);
  const porDia = useMemo(() => indexarPorDia(frequencias), [frequencias]);
  const horarios = useMemo(() => turmas.flatMap((turma) => turma.horarios), [turmas]);

  const linhas = useMemo(() => {
    const termo = normalizar(busca);
    return alunos
      .filter((aluno) => aluno.ativo)
      .filter((aluno) => (serieFiltro ? turmaSerie.get(aluno.turmaId) === serieFiltro : true))
      .filter((aluno) => (turmaFiltro ? aluno.turmaId === turmaFiltro : true))
      .filter((aluno) => (termo === "" ? true : normalizar(aluno.nome).includes(termo)))
      .map((aluno) => ({
        aluno,
        resumo: resumoPorAluno(aluno, dias, porDia, saidas, horarios),
      }))
      .sort(
        (a, b) =>
          b.resumo.faltas + b.resumo.justificadas - (a.resumo.faltas + a.resumo.justificadas) ||
          a.aluno.nome.localeCompare(b.aluno.nome, "pt-BR"),
      );
  }, [alunos, busca, serieFiltro, turmaFiltro, turmaSerie, dias, porDia, saidas, horarios]);

  async function atualizar() {
    setAtualizando(true);
    try {
      await onRecarregar(mes);
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <section aria-label="Relatório por aluno" className="flex flex-col gap-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Por aluno</h1>
          <p className="text-muted-foreground text-sm">
            Faltas, justificadas e saídas no mês, com o acumulado do histórico.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Atualizar relatório"
          onClick={() => void atualizar()}
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
            id="mes-por-aluno"
            modo="mes"
            valor={mes}
            max={mesCorrente}
            rotuloAcessivel="Mês do relatório"
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

      <div className="flex flex-col gap-3">
        <BarraBusca
          id="busca-por-aluno"
          valor={busca}
          onValor={setBusca}
          placeholder="Buscar aluno"
        />
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Série</span>
            <Selecionar
              id="por-aluno-serie"
              value={serieFiltro}
              onValueChange={setSerieFiltro}
              placeholder="Todas as séries"
              opcoes={[
                { valor: "", rotulo: "Todas as séries" },
                ...series.map((serie) => ({ valor: serie.id, rotulo: serie.nome })),
              ]}
            />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Turma</span>
            <Selecionar
              id="por-aluno-turma"
              value={turmaFiltro}
              onValueChange={setTurmaFiltro}
              placeholder="Todas as turmas"
              opcoes={[
                { valor: "", rotulo: "Todas as turmas" },
                ...turmas
                  .filter((turma) => (serieFiltro ? turma.serieId === serieFiltro : true))
                  .map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
              ]}
            />
          </div>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum aluno encontrado</p>
          <p className="text-muted-foreground text-sm">Ajuste a busca ou os filtros.</p>
        </div>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-lg border">
          {linhas.map(({ aluno, resumo: doAluno }) => {
            const acumulado = acumuladoDe(aluno.id);
            const aberto = expandido === aluno.id;
            return (
              <li
                key={aluno.id}
                className="last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)]"
              >
                <button
                  type="button"
                  aria-expanded={aberto}
                  onClick={() => setExpandido((atual) => (atual === aluno.id ? null : aluno.id))}
                  className="hover:bg-secondary/60 active:bg-secondary/80 pressionavel flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{aluno.nome}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {rotuloTurma(aluno.turmaId)}
                      {aluno.turmaOriginalId !== aluno.turmaId
                        ? ` · origem ${rotuloTurma(aluno.turmaOriginalId)}`
                        : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-falta-texto numerais-tabulares" title="Faltas no mês">
                      {doAluno.faltas} F
                    </span>
                    <span className="text-primary numerais-tabulares" title="Justificadas no mês">
                      {doAluno.justificadas} FJ
                    </span>
                    <span
                      className="text-muted-foreground numerais-tabulares"
                      title="Saídas no mês"
                    >
                      {doAluno.saidas} S
                    </span>
                  </span>
                </button>
                {aberto && (
                  <div className="bg-secondary/30 border-t px-4 py-3">
                    <p className="text-muted-foreground text-xs">
                      Acumulado desde{" "}
                      {resumo?.primeiroDia
                        ? resumo.primeiroDia.split("-").reverse().join("/")
                        : "a primeira chamada"}
                      : <strong className="text-falta-texto">{acumulado?.faltas ?? 0} F</strong>
                      {" · "}
                      <strong className="text-primary">
                        {acumulado?.faltasJustificadas ?? 0} FJ
                      </strong>
                      {" em "}
                      {resumo?.diasLetivos ?? 0}{" "}
                      {resumo?.diasLetivos === 1 ? "dia letivo" : "dias letivos"}
                    </p>
                    <div className="mt-2">
                      <DetalheAluno
                        aluno={aluno}
                        dias={dias}
                        porDia={porDia}
                        horarios={horarios}
                        saidas={saidas}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
