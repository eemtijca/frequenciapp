"use client";

// Resumo mensal com comparação de séries e turmas, evolução diária e rankings de faltas por aluno.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import {
  diasDoMes,
  mesSeguinte,
  rotuloDataCurta,
  rotuloMes,
  type Aluno,
  type Frequencia,
  type Serie,
  type Turma,
} from "@/domain/frequencia";
import {
  alunosPorFaltas,
  ausencias,
  distribuicaoDoPeriodo,
  evolucaoDoPeriodo,
  infrequencia,
  type CriterioRankingFaltas,
} from "@/domain/relatorios";
import { Button } from "@/components/ui/button";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { GraficoEvolucao } from "@/components/graficos/graficos-sob-demanda";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { avisarErro } from "@/lib/avisos";

interface Props {
  mes: string;
  mesCorrente: string;
  diaCorrente: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  bloqueado: boolean;
  carregando: boolean;
  erro: string | null;
  onMes: (mes: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
}

const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const RANKINGS: Record<
  CriterioRankingFaltas,
  {
    botao: string;
    titulo: string;
    vazio: string;
    unidade: [singular: string, plural: string];
  }
> = {
  todas: {
    botao: "Todas as faltas (F + FJ)",
    titulo: "Alunos com mais faltas",
    vazio: "Nenhuma falta registrada neste filtro.",
    unidade: ["falta", "faltas"],
  },
  faltas: {
    botao: "Sem justificativa (F)",
    titulo: "Alunos com mais faltas sem justificativa",
    vazio: "Nenhuma falta sem justificativa neste filtro.",
    unidade: ["falta", "faltas"],
  },
  justificadas: {
    botao: "Justificadas (FJ)",
    titulo: "Alunos com mais faltas justificadas",
    vazio: "Nenhuma falta justificada neste filtro.",
    unidade: ["justificada", "justificadas"],
  },
};

export default function ResumoRelatorios({
  mes,
  mesCorrente,
  diaCorrente,
  series,
  turmas,
  alunos,
  frequencias,
  bloqueado,
  carregando,
  erro,
  onMes,
  onRecarregar,
}: Props) {
  const [serieId, setSerieId] = useState("todas");
  const [turmaId, setTurmaId] = useState("todas");
  const [compararPor, setCompararPor] = useState("turmas");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [criterioRanking, setCriterioRanking] = useState<CriterioRankingFaltas>("todas");
  const turmasVisiveis = useMemo(
    () => turmas.filter((turma) => serieId === "todas" || turma.serieId === serieId),
    [turmas, serieId],
  );
  const dados = useMemo(() => {
    const selecionadas = turmasVisiveis.filter(
      (turma) => turmaId === "todas" || turma.id === turmaId,
    );
    const ids = new Set(selecionadas.map((turma) => turma.id));
    const doFiltro = alunos.filter((aluno) => ids.has(aluno.turmaId));
    const dias = diasDoMes(mes).filter((dia) => dia <= diaCorrente);
    const porSerie = distribuicaoDoPeriodo(
      series,
      turmas,
      doFiltro,
      frequencias,
      dias[0] ?? mes,
      dias.at(-1) ?? mes,
    ).filter((serie) => selecionadas.some((turma) => turma.serieId === serie.serieId));
    const porTurma = porSerie
      .flatMap((serie) => serie.turmas)
      .filter((turma) => ids.has(turma.turmaId));
    const total = porTurma.reduce(
      (soma, turma) => ({
        registrados: soma.registrados + turma.registrados,
        faltas: soma.faltas + turma.faltas,
        justificadas: soma.justificadas + turma.justificadas,
      }),
      { registrados: 0, faltas: 0, justificadas: 0 },
    );
    const evolucao = evolucaoDoPeriodo(doFiltro, turmas, frequencias, dias).map((dia) => ({
      ...dia,
      rotulo: rotuloDataCurta(dia.dia),
      valor: dia.taxa === null ? null : Math.round(dia.taxa * 1000) / 10,
    }));
    return { porSerie, porTurma, total, evolucao, doFiltro, dias };
  }, [alunos, diaCorrente, frequencias, mes, series, turmaId, turmas, turmasVisiveis]);
  const ranking = useMemo(
    () => alunosPorFaltas(dados.doFiltro, turmas, frequencias, dados.dias, criterioRanking),
    [dados.doFiltro, dados.dias, turmas, frequencias, criterioRanking],
  );
  const { executando, executar } = useAcaoUnica(async () => {
    try {
      await onRecarregar(mes);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível atualizar o resumo." });
    }
  });
  const ocupado = carregando || executando;
  const comparacoes =
    compararPor === "series"
      ? dados.porSerie.map((serie) => ({ ...serie, id: serie.serieId, rotulo: serie.nome }))
      : dados.porTurma.map((turma) => ({ ...turma, id: turma.turmaId }));
  const taxa =
    dados.total.registrados > 0
      ? percentual.format((dados.total.faltas + dados.total.justificadas) / dados.total.registrados)
      : "Sem registro";

  return (
    <section aria-label="Resumo dos relatórios" aria-busy={ocupado} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Resumo do mês</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 sm:order-last"
          aria-label="Atualizar resumo"
          disabled={ocupado}
          onClick={() => void executar()}
        >
          {ocupado ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </Button>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-md sm:flex-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Mês anterior do resumo"
            disabled={bloqueado || ocupado}
            onClick={() => onMes(mesSeguinte(mes, -1))}
          >
            <ChevronLeft size={18} />
          </Button>
          <div className="min-w-0 flex-1">
            <SeletorPeriodo
              id="mes-resumo"
              modo="mes"
              valor={mes}
              max={mesCorrente}
              disabled={bloqueado || ocupado}
              rotuloAcessivel="Mês do resumo"
              rotulo={`${rotuloMes(mes).slice(0, 3)}/${mes.slice(0, 4)}`}
              onValor={onMes}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Mês seguinte do resumo"
            disabled={bloqueado || ocupado || mes >= mesCorrente}
            onClick={() => onMes(mesSeguinte(mes, 1))}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecionar
          ariaLabel="Série do resumo"
          value={serieId}
          onValueChange={(valor) => {
            setSerieId(valor);
            setTurmaId("todas");
          }}
          opcoes={[
            { valor: "todas", rotulo: "Todas as séries" },
            ...series.map((serie) => ({ valor: serie.id, rotulo: serie.nome })),
          ]}
        />
        <Selecionar
          ariaLabel="Turma do resumo"
          value={turmaId}
          onValueChange={setTurmaId}
          opcoes={[
            { valor: "todas", rotulo: "Todas as turmas" },
            ...turmasVisiveis.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
          ]}
        />
      </div>
      {ocupado ? (
        <p role="status" className="text-muted-foreground py-8 text-center text-sm">
          Carregando resumo...
        </p>
      ) : erro ? (
        <p role="alert" className="text-destructive rounded-xl border p-4 text-sm">
          {erro}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              ["Faltas (F + FJ)", dados.total.faltas + dados.total.justificadas],
              ["Justificadas", dados.total.justificadas],
              ["Infrequência", taxa],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="superficie-vidro min-w-0 p-3 sm:p-4">
                <dt className="text-muted-foreground text-xs sm:text-sm">{rotulo}</dt>
                <dd className="numerais-tabulares mt-1 text-lg font-semibold sm:text-2xl">
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-xs">
            Alunos ativos por turma atual. Taxas sobre chamadas salvas; dias sem registro ficam sem
            taxa.
          </p>
          {dados.total.registrados === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              Nenhuma chamada registrada para este filtro no mês.
            </p>
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <section
                aria-label={
                  compararPor === "series" ? "Infrequência por série" : "Infrequência por turma"
                }
                className="superficie-vidro min-w-0 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">Comparação</h3>
                  <Selecionar
                    ariaLabel="Comparar por"
                    value={compararPor}
                    onValueChange={setCompararPor}
                    className="w-32"
                    opcoes={[
                      { valor: "turmas", rotulo: "Turmas" },
                      { valor: "series", rotulo: "Séries" },
                    ]}
                  />
                </div>
                <ul className="mt-4 space-y-4">
                  {comparacoes.map((turma) => (
                    <li key={turma.id} className="text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-medium break-words">{turma.rotulo}</span>
                        <strong className="numerais-tabulares shrink-0">
                          {turma.registrados > 0
                            ? percentual.format(infrequencia(turma))
                            : "Sem registro"}
                        </strong>
                      </div>
                      <div
                        aria-hidden="true"
                        className="bg-secondary mt-2 h-2 overflow-hidden rounded-full"
                      >
                        <div
                          className="bg-chart-3 h-full rounded-full"
                          style={{ width: `${infrequencia(turma) * 100}%` }}
                        />
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {ausencias(turma)} {ausencias(turma) === 1 ? "falta" : "faltas"} em{" "}
                        {turma.registrados} registros de aluno por dia
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section
                aria-label="Evolução da infrequência"
                className="superficie-vidro min-w-0 p-4"
              >
                <h3 className="font-semibold">Evolução no mês</h3>
                <GraficoEvolucao evolucao={dados.evolucao} />
                <details className="mt-3 text-xs">
                  <summary className="text-primary cursor-pointer py-2 font-medium">
                    Ver dados diários
                  </summary>
                  <table className="w-full text-left">
                    <caption className="sr-only">Infrequência por dia no mês selecionado</caption>
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className="py-2">
                          Dia
                        </th>
                        <th scope="col">F + FJ</th>
                        <th scope="col">Registros</th>
                        <th scope="col">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.evolucao.map((dia) => (
                        <tr key={dia.dia} className="border-b">
                          <th scope="row" className="py-2 font-normal">
                            {dia.rotulo}
                          </th>
                          <td>{ausencias(dia)}</td>
                          <td>{dia.registrados}</td>
                          <td>
                            {dia.taxa === null ? "Sem registro" : percentual.format(dia.taxa)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </section>
              <section
                aria-label="Alunos com mais faltas"
                className="superficie-vidro min-w-0 p-4 xl:col-span-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{RANKINGS[criterioRanking].titulo}</h3>
                  <p className="text-muted-foreground text-xs">F: falta · FJ: justificada</p>
                </div>
                <div
                  role="group"
                  aria-label="Ranking de alunos"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {(Object.keys(RANKINGS) as CriterioRankingFaltas[]).map((criterio) => (
                    <Button
                      key={criterio}
                      type="button"
                      variant="outline"
                      aria-pressed={criterioRanking === criterio}
                      onClick={() => {
                        setCriterioRanking(criterio);
                        setMostrarTodos(false);
                      }}
                      className={`rounded-full px-4 ${criterioRanking === criterio ? "vidro-selecionado" : ""}`}
                    >
                      {RANKINGS[criterio].botao}
                    </Button>
                  ))}
                </div>
                {ranking.length === 0 ? (
                  <p className="text-muted-foreground mt-3 text-sm">
                    {RANKINGS[criterioRanking].vazio}
                  </p>
                ) : (
                  <>
                    <ol className="mt-4 grid gap-3 md:grid-cols-2">
                      {(mostrarTodos ? ranking : ranking.slice(0, 10)).map((item, indice) => (
                        <li
                          key={item.aluno.id}
                          className="flex min-w-0 items-center gap-3 rounded-lg border p-3"
                        >
                          <span
                            aria-hidden="true"
                            className="text-muted-foreground numerais-tabulares text-xs"
                          >
                            {indice + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium break-words">
                              {item.aluno.nome}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {turmas.find((turma) => turma.id === item.aluno.turmaId)?.rotulo}
                            </span>
                          </span>
                          <span className="numerais-tabulares shrink-0 text-right">
                            <strong className="block text-sm">
                              {item.quantidade}{" "}
                              {RANKINGS[criterioRanking].unidade[item.quantidade === 1 ? 0 : 1]}
                            </strong>
                            <span className="text-muted-foreground text-xs">
                              {item.faltas} F · {item.justificadas} FJ
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    {ranking.length > 10 && (
                      <Button
                        variant="ghost"
                        className="mt-3"
                        aria-expanded={mostrarTodos}
                        onClick={() => setMostrarTodos((atual) => !atual)}
                      >
                        {mostrarTodos ? "Mostrar 10 primeiros" : `Ver todos (${ranking.length})`}
                      </Button>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
