"use client";

// Grade de frequência por turma de origem: modos dia, semana de aula,
// período personalizado e mês; células P, F e FJ, saída no dia e coluna
// acumulada (F + FJ) de todo o histórico.
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Table2 } from "lucide-react";
import type { Aluno, Frequencia, ModoPeriodo, ResumoAcumulado, Turma } from "@/domain/frequencia";
import {
  diasDoMes,
  diasDoPeriodo,
  mesSeguinte,
  montarGrade,
  normalizar,
  rotuloDiaSemana,
  rotuloMes,
} from "@/domain/frequencia";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface Props {
  alunos: Aluno[];
  frequencias: Frequencia[];
  resumo: ResumoAcumulado | null;
  mes: string;
  mesCorrente: string;
  hoje: string;
  aberto: boolean;
  versao: number;
  origens: Turma[];
  onMes: (mes: string) => void;
  onRecarregar: () => Promise<void>;
}

const MODOS: { valor: ModoPeriodo; rotulo: string }[] = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "dia", rotulo: "Um dia" },
  { valor: "semana", rotulo: "Uma semana de aula" },
  { valor: "periodo", rotulo: "Período personalizado" },
];

function dataCurta(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${numero}/${mes}`;
}

export default function VistaGrade({
  alunos,
  frequencias,
  resumo,
  mes,
  mesCorrente,
  hoje,
  aberto,
  versao,
  origens,
  onMes,
  onRecarregar,
}: Props) {
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<ModoPeriodo>("mes");
  const [diaBase, setDiaBase] = useState(hoje);
  const [diaFim, setDiaFim] = useState(hoje);
  const [doPeriodo, setDoPeriodo] = useState<Frequencia[] | null>(null);
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const rotuloDe = useMemo(() => {
    const mapa = new Map(origens.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [origens]);

  const turmasOriginais = useMemo(() => {
    const distintas = new Set(
      alunos.filter((aluno) => aluno.ativo).map((aluno) => aluno.turmaOriginalId),
    );
    return origens
      .filter((turma) => distintas.has(turma.id))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [alunos, origens]);

  const [turmaId, setTurmaId] = useState(() => turmasOriginais[0]?.id ?? "");
  const turmaEfetiva = turmasOriginais.some((turma) => turma.id === turmaId)
    ? turmaId
    : (turmasOriginais[0]?.id ?? "");

  const dias = useMemo(() => {
    if (modo === "mes") return diasDoMes(mes);
    return diasDoPeriodo(modo, diaBase, diaFim);
  }, [modo, mes, diaBase, diaFim]);

  // No modo mês usamos o estado compartilhado do app; nos demais, o período
  // é buscado na API para não depender do mês carregado.
  useEffect(() => {
    if (modo === "mes" || !aberto) {
      setDoPeriodo(null);
      return;
    }
    const primeiro = dias[0] ?? diaBase;
    const ultimo = dias[dias.length - 1] ?? diaBase;
    let viva = true;
    setCarregandoPeriodo(true);
    setErro("");
    pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?de=${primeiro}&ate=${ultimo}`)
      .then((dados) => {
        if (viva) setDoPeriodo(dados.frequencias);
      })
      .catch((excecao: unknown) => {
        if (!viva) return;
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível buscar o período.",
        );
      })
      .finally(() => {
        if (viva) setCarregandoPeriodo(false);
      });
    return () => {
      viva = false;
    };
  }, [aberto, modo, dias, diaBase, versao, recarga]);

  const frequenciasDoPeriodo = useMemo(() => {
    if (modo === "mes") return frequencias.filter((frequencia) => frequencia.dia.startsWith(mes));
    return doPeriodo ?? [];
  }, [modo, frequencias, mes, doPeriodo]);

  const grade = useMemo(() => {
    const alunosDaTurma = alunos.filter(
      (aluno) => aluno.ativo && aluno.turmaOriginalId === turmaEfetiva,
    );
    return montarGrade(
      alunosDaTurma,
      frequenciasDoPeriodo,
      dias,
      origens.flatMap((turma) => turma.horarios),
    );
  }, [alunos, turmaEfetiva, frequenciasDoPeriodo, dias, origens]);

  const termo = normalizar(busca);
  const linhas = grade.linhas.filter(
    (linha) => termo === "" || normalizar(linha.aluno.nome).includes(termo),
  );

  const acumuladoDe = useMemo(() => {
    const mapa = new Map(
      (resumo?.porAluno ?? []).map((item) => [item.alunoId, item.faltas + item.faltasJustificadas]),
    );
    return (alunoId: string) => mapa.get(alunoId) ?? 0;
  }, [resumo]);

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    try {
      if (modo === "mes") {
        await onRecarregar();
      } else {
        setDoPeriodo(null);
        setRecarga((valor) => valor + 1);
      }
    } finally {
      setAtualizando(false);
    }
  }

  const totalFaltas = grade.linhas.reduce((soma, linha) => soma + linha.faltas, 0);
  const totalJustificadas = grade.linhas.reduce((soma, linha) => soma + linha.justificadas, 0);
  const turmaAtualDe = useMemo(() => {
    const mapa = new Map(origens.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [origens]);

  return (
    <section aria-label="Grade de frequência" className="flex flex-col gap-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Grade</h1>
          <p className="text-muted-foreground text-sm">
            {frequenciasDoPeriodo.length === 0
              ? "Consulta pelas turmas de origem"
              : `${frequenciasDoPeriodo.length} ${
                  frequenciasDoPeriodo.length === 1 ? "frequência" : "frequências"
                } no período${
                  totalFaltas + totalJustificadas > 0
                    ? ` · ${totalFaltas + totalJustificadas} ${
                        totalFaltas + totalJustificadas === 1 ? "falta" : "faltas"
                      } (F + FJ)`
                    : ""
                }`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Atualizar consulta"
          onClick={() => void atualizar()}
          disabled={atualizando || carregandoPeriodo}
        >
          {atualizando || carregandoPeriodo ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {turmasOriginais.map((turma) => {
          const ativo = turma.id === turmaEfetiva;
          const quantidade = alunos.filter(
            (aluno) => aluno.ativo && aluno.turmaOriginalId === turma.id,
          ).length;
          return (
            <button
              key={turma.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => setTurmaId(turma.id)}
              className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors active:scale-[0.98]"
            >
              <span>{turma.rotulo}</span>
              <span className="numerais-tabulares text-xs opacity-70">{quantidade}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Selecionar
            id="grade-modo"
            value={modo}
            onValueChange={(valor) => {
              setModo(valor as ModoPeriodo);
              setDoPeriodo(null);
            }}
            ariaLabel="Período da consulta"
            opcoes={MODOS.map((item) => ({ valor: item.valor, rotulo: item.rotulo }))}
          />
        </div>

        {modo === "mes" ? (
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
                id="mes-grade"
                modo="mes"
                valor={mes}
                max={mesCorrente}
                rotuloAcessivel="Mês da consulta"
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
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                {modo === "periodo" ? "De" : modo === "semana" ? "Data da semana" : "Data"}
              </span>
              <SeletorPeriodo
                id="grade-dia"
                modo="dia"
                valor={diaBase}
                max={hoje}
                rotuloAcessivel="Data inicial da consulta"
                rotulo={dataCurta(diaBase)}
                detalhe={rotuloDiaSemana(diaBase)}
                onValor={setDiaBase}
              />
            </div>
            {modo === "periodo" && (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium">Até</span>
                <SeletorPeriodo
                  id="grade-dia-fim"
                  modo="dia"
                  valor={diaFim}
                  max={hoje}
                  rotuloAcessivel="Data final da consulta"
                  rotulo={dataCurta(diaFim)}
                  detalhe={rotuloDiaSemana(diaFim)}
                  onValor={setDiaFim}
                />
              </div>
            )}
            {modo === "semana" && (
              <p className="text-muted-foreground text-xs">Segunda a sexta da semana escolhida.</p>
            )}
          </div>
        )}

        {modo === "mes" && mes !== mesCorrente && (
          <button
            type="button"
            onClick={() => onMes(mesCorrente)}
            className="text-primary self-start text-sm font-medium hover:underline"
          >
            Voltar para este mês
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" className="bg-falta-fraca text-falta-texto rounded-lg px-4 py-3 text-sm">
          {erro}
        </p>
      )}

      {turmasOriginais.length === 0 ? (
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <Table2 size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Sem alunos ativos</p>
          <p className="text-muted-foreground text-sm">
            Quando houver alunos nas suas turmas, a consulta aparece aqui.
          </p>
        </div>
      ) : (
        <motion.div
          key={turmaEfetiva + modo}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-card overflow-hidden rounded-lg border"
        >
          <BarraBusca
            id="busca-grade"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar aluno"
            className="rounded-none border-0 border-b px-3 py-1.5"
          />
          {carregandoPeriodo ? (
            <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
              <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
              Buscando o período...
            </div>
          ) : linhas.length === 0 ? (
            <div className="text-muted-foreground flex min-h-40 items-center justify-center px-6 text-center text-sm">
              Nenhum aluno encontrado para esta busca.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Frequência dos alunos da turma original {rotuloDe(turmaEfetiva)} no período
                </caption>
                <thead>
                  <tr className="border-b">
                    <th
                      scope="col"
                      className="coluna-fixa bg-card text-muted-foreground min-w-36 border-r px-3 py-2 text-left text-xs font-medium"
                    >
                      Aluno
                    </th>
                    {grade.dias.map((dia) => (
                      <th
                        key={dia}
                        scope="col"
                        className={`numerais-tabulares w-8 border-l px-1 py-2 text-center text-[11px] font-medium ${
                          dia === hoje ? "bg-primary/10 text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {mesmoMes(dia, grade.dias) ? dia.slice(8) : dataCurta(dia)}
                      </th>
                    ))}
                    <th
                      scope="col"
                      title="Faltas totais (F + FJ) de todo o histórico"
                      className="numerais-tabulares text-muted-foreground border-l px-2 py-2 text-center text-[11px] font-medium"
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha) => (
                    <tr key={linha.aluno.id} className="border-b last:border-b-0">
                      <th
                        scope="row"
                        className="coluna-fixa bg-card max-w-44 truncate border-r px-3 py-1.5 text-left font-normal"
                      >
                        <span className="block truncate text-sm">{linha.aluno.nome}</span>
                        <span className="text-muted-foreground block truncate text-[10px]">
                          atual {turmaAtualDe(linha.aluno.turmaId)}
                        </span>
                      </th>
                      {grade.dias.map((dia) => {
                        const marca = linha.marcas[dia];
                        return (
                          <td
                            key={dia}
                            className={`border-l px-1 py-1.5 text-center ${
                              dia === hoje ? "bg-primary/5" : ""
                            }`}
                          >
                            {marca === "F" || marca === "FJ" ? (
                              <span
                                className={
                                  marca === "FJ"
                                    ? "border-primary text-primary inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border px-0.5 text-[9px] font-bold"
                                    : "bg-falta text-falta-foreground inline-flex size-5 items-center justify-center rounded-[4px] text-[10px] font-bold"
                                }
                                role="img"
                                aria-label={`${linha.aluno.nome} com ${
                                  marca === "FJ" ? "falta justificada" : "falta"
                                } em ${dia}`}
                              >
                                {marca}
                              </span>
                            ) : marca === "S" ? (
                              <span
                                className="border-falta text-falta-texto inline-flex size-5 items-center justify-center rounded-[4px] border text-[10px] font-bold"
                                role="img"
                                aria-label={`${linha.aluno.nome} presente em parte das aulas em ${dia}`}
                              >
                                S
                              </span>
                            ) : marca === "P" ? (
                              <span
                                className="bg-primary/60 inline-flex size-1.5 rounded-full"
                                role="img"
                                aria-label={`${linha.aluno.nome} presente em ${dia}`}
                              />
                            ) : (
                              <span
                                className="text-muted-foreground/50 text-[10px]"
                                role="img"
                                aria-label={`${linha.aluno.nome} sem frequência em ${dia}`}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="numerais-tabulares text-falta-texto border-l px-2 py-1.5 text-center text-sm font-semibold">
                        {acumuladoDe(linha.aluno.id) > 0 ? acumuladoDe(linha.aluno.id) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-4 border-t px-4 py-2.5 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="bg-primary/60 inline-flex size-1.5 rounded-full"
                aria-hidden="true"
              />
              presente
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="bg-falta text-falta-foreground inline-flex size-4 items-center justify-center rounded-[3px] text-[9px] font-bold"
                aria-hidden="true"
              >
                F
              </span>
              falta
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="border-primary text-primary inline-flex h-4 items-center justify-center rounded-[3px] border px-0.5 text-[8px] font-bold"
                aria-hidden="true"
              >
                FJ
              </span>
              falta justificada
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="border-falta text-falta-texto inline-flex size-4 items-center justify-center rounded-[3px] border text-[9px] font-bold"
                aria-hidden="true"
              >
                S
              </span>
              presente em parte das aulas
            </span>
            <span>Total: faltas (F + FJ) de todo o histórico</span>
            <span>célula vazia: turma sem frequência no dia</span>
          </div>
        </motion.div>
      )}
    </section>
  );
}

/** Verdadeiro quando o dia pertence a um período dentro de um único mês. */
function mesmoMes(dia: string, dias: string[]): boolean {
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  if (!primeiro || !ultimo) return true;
  return primeiro.slice(0, 7) === ultimo.slice(0, 7) && primeiro.slice(0, 7) === dia.slice(0, 7);
}
