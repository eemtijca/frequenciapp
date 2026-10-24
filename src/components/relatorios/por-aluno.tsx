"use client";

// Relatório por aluno no mês: faltas, faltas justificadas, saídas e dias com registro,
// com o acumulado de todo o histórico. A lista se agrupa em séries e turmas recolhíveis.
import {
  memo,
  useDeferredValue,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  UserRound,
} from "lucide-react";
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
  partesJustificativaSaida,
  rotuloMes,
  rotuloMomento,
} from "@/domain/frequencia";
import { CirculosAcumulado } from "@/components/ui/circulo-contagem";
import { indexarPorDia, resumoPorAluno, type ResumoAlunoPeriodo } from "@/domain/relatorios";
import { Button } from "@/components/ui/button";
import { CaixasDeInfo } from "@/components/ui/caixas-de-info";
import { BarraBusca } from "@/components/ui/barra-busca";
import { avisarInfo } from "@/lib/avisos";
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
                    ? "border-justificada/40 bg-justificada-fraca text-justificada-texto"
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
          {saidasDoAluno.map((saida) => {
            const partes = partesJustificativaSaida(saida);
            return (
              <li key={saida.id} className="text-muted-foreground flex flex-col gap-1">
                <span className="numerais-tabulares text-foreground font-medium">
                  {saida.dia.split("-").reverse().join("/")}
                </span>
                <CaixasDeInfo
                  partes={[
                    rotuloMomento(saida.momento),
                    partes.motivo,
                    partes.complemento,
                    saida.liberadoPorNome ? `Liberado por ${saida.liberadoPorNome}` : "",
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface LinhaResumo {
  aluno: Aluno;
  nomeNormalizado: string;
  resumo: ResumoAlunoPeriodo;
}

interface GrupoTurma {
  turma: Turma;
  linhas: LinhaResumo[];
}

interface GrupoSerie {
  serie: Pick<Serie, "id" | "nome">;
  turmas: GrupoTurma[];
  alunos: number;
}

function contagemDeAlunos(total: number): string {
  return `${total} ${total === 1 ? "aluno" : "alunos"}`;
}

interface CabecalhoGrupoProps {
  titulo: string;
  total: number;
  aberto: boolean;
  nivel: "serie" | "turma";
  linhas?: LinhaResumo[];
  onAlternar: () => void;
}

/** Cabeçalho de série ou turma: recolhe e expande os alunos abaixo dele. */
function CabecalhoGrupo({ titulo, total, aberto, nivel, linhas, onAlternar }: CabecalhoGrupoProps) {
  return (
    <button
      type="button"
      aria-expanded={aberto}
      onClick={onAlternar}
      className={`pressionavel hover:bg-secondary/60 flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
        nivel === "serie" ? "bg-secondary/50 font-semibold" : "font-medium"
      }`}
    >
      <ChevronDown
        size={18}
        aria-hidden="true"
        className={`text-muted-foreground shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{titulo}</span>
        <span className="text-muted-foreground block text-xs font-normal">
          {contagemDeAlunos(total)}
        </span>
      </span>
      {linhas && (
        <CirculosAcumulado
          faltas={linhas.reduce((soma, { resumo }) => soma + resumo.faltas, 0)}
          justificadas={linhas.reduce((soma, { resumo }) => soma + resumo.justificadas, 0)}
          saidas={linhas.reduce((soma, { resumo }) => soma + resumo.saidas, 0)}
        />
      )}
    </button>
  );
}

interface ListaAlunosProps {
  linhas: LinhaResumo[];
  expandido: string | null;
  setExpandido: Dispatch<SetStateAction<string | null>>;
  rotuloTurma: (id: string) => string;
  acumuladoDe: (id: string) => ResumoAcumulado["porAluno"][number] | null;
  resumo: ResumoAcumulado | null;
  dias: string[];
  porDia: Map<string, Frequencia[]>;
  horarios: Horario[];
  saidas: SaidaAntecipada[];
}

// A lista mantém o último filtro enquanto o campo de busca responde à digitação.
const ListaAlunos = memo(function ListaAlunos({
  linhas,
  expandido,
  setExpandido,
  rotuloTurma,
  acumuladoDe,
  resumo,
  dias,
  porDia,
  horarios,
  saidas,
}: ListaAlunosProps) {
  return (
    <ul className="divide-y border-t">
      {linhas.map(({ aluno, resumo: doAluno }) => {
        const acumulado = acumuladoDe(aluno.id);
        const aberto = expandido === aluno.id;
        return (
          <li key={aluno.id}>
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
              <CirculosAcumulado
                faltas={doAluno.faltas}
                justificadas={doAluno.justificadas}
                saidas={doAluno.saidas}
              />
            </button>
            {aberto && (
              <div className="bg-secondary/30 border-t px-4 py-3">
                <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                  <span>
                    Acumulado desde{" "}
                    {resumo?.primeiroDia
                      ? resumo.primeiroDia.split("-").reverse().join("/")
                      : "a primeira chamada"}
                  </span>
                  <CirculosAcumulado
                    faltas={acumulado?.faltas ?? 0}
                    justificadas={acumulado?.faltasJustificadas ?? 0}
                  />
                  <span>
                    em {resumo?.diasLetivos ?? 0}{" "}
                    {resumo?.diasLetivos === 1 ? "dia letivo" : "dias letivos"}
                  </span>
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
  );
});

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
}: Props) {
  const [busca, setBusca] = useState("");
  const [seriesFechadas, setSeriesFechadas] = useState<ReadonlySet<string>>(new Set());
  const [turmasFechadas, setTurmasFechadas] = useState<ReadonlySet<string>>(new Set());
  const [expandido, setExpandido] = useState<string | null>(null);

  const rotuloTurma = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Sem turma";
  }, [turmas]);

  const acumuladoDe = useMemo(() => {
    const mapa = new Map((resumo?.porAluno ?? []).map((item) => [item.alunoId, item]));
    return (alunoId: string) => mapa.get(alunoId) ?? null;
  }, [resumo]);

  const dias = useMemo(() => diasDoMes(mes), [mes]);
  const porDia = useMemo(() => indexarPorDia(frequencias), [frequencias]);
  const horarios = useMemo(() => turmas.flatMap((turma) => turma.horarios), [turmas]);

  // Os cálculos do mês e a ordenação não dependem da digitação nem dos filtros.
  const resumos = useMemo(
    () =>
      alunos
        .filter((aluno) => aluno.ativo)
        .map((aluno) => ({
          aluno,
          nomeNormalizado: normalizar(aluno.nome),
          resumo: resumoPorAluno(aluno, dias, porDia, saidas, horarios),
        }))
        .sort(
          (a, b) =>
            b.resumo.faltas + b.resumo.justificadas - (a.resumo.faltas + a.resumo.justificadas) ||
            a.aluno.nome.localeCompare(b.aluno.nome, "pt-BR"),
        ),
    [alunos, dias, porDia, saidas, horarios],
  );
  const termo = useDeferredValue(normalizar(busca));
  const linhas = useMemo(
    () => resumos.filter(({ nomeNormalizado }) => termo === "" || nomeNormalizado.includes(termo)),
    [resumos, termo],
  );
  // Séries e turmas seguem a ordem do cadastro; só aparecem as que têm aluno na busca.
  const grupos = useMemo<GrupoSerie[]>(() => {
    const porTurma = new Map<string, LinhaResumo[]>();
    for (const linha of linhas) {
      porTurma.set(linha.aluno.turmaId, [...(porTurma.get(linha.aluno.turmaId) ?? []), linha]);
    }
    const ordemSeries = [...series].sort(
      (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"),
    );
    const resultado: GrupoSerie[] = [];
    for (const serie of ordemSeries) {
      const gruposTurma = turmas
        .filter((turma) => turma.serieId === serie.id && porTurma.has(turma.id))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }))
        .map((turma) => ({ turma, linhas: porTurma.get(turma.id) ?? [] }));
      if (gruposTurma.length === 0) continue;
      resultado.push({
        serie,
        turmas: gruposTurma,
        alunos: gruposTurma.reduce((soma, grupo) => soma + grupo.linhas.length, 0),
      });
    }
    return resultado;
  }, [linhas, series, turmas]);

  // Na busca, os grupos com resultado ficam abertos; o recolhimento volta ao limpar o campo.
  const buscando = termo !== "";
  const todasSeriesAbertas = grupos.every(({ serie }) => !seriesFechadas.has(serie.id));
  const todasTurmasAbertas =
    todasSeriesAbertas &&
    grupos.every(({ turmas: doGrupo }) =>
      doGrupo.every(({ turma }) => !turmasFechadas.has(turma.id)),
    );

  function alternarSeries() {
    setSeriesFechadas(
      todasSeriesAbertas ? new Set(grupos.map(({ serie }) => serie.id)) : new Set(),
    );
  }

  function alternarTurmas() {
    if (todasTurmasAbertas) {
      setTurmasFechadas(
        new Set(grupos.flatMap(({ turmas: doGrupo }) => doGrupo.map(({ turma }) => turma.id))),
      );
      return;
    }
    // Abrir as turmas também abre as séries, para o resultado aparecer na tela.
    setSeriesFechadas(new Set());
    setTurmasFechadas(new Set());
  }

  function alternarGrupo(
    atual: ReadonlySet<string>,
    definir: Dispatch<SetStateAction<ReadonlySet<string>>>,
    id: string,
  ) {
    const proximo = new Set(atual);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    definir(proximo);
  }

  return (
    <section aria-label="Relatório por aluno" className="flex flex-col gap-4 pb-6">
      <h1 className="text-xl font-semibold tracking-tight">Por aluno</h1>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
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
          className="size-11 shrink-0"
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
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-28 flex-1"
            aria-expanded={todasSeriesAbertas}
            aria-label={`${todasSeriesAbertas ? "Recolher" : "Expandir"} todas as séries`}
            disabled={buscando || grupos.length === 0}
            onClick={alternarSeries}
          >
            {todasSeriesAbertas ? (
              <ChevronsDownUp size={16} aria-hidden="true" />
            ) : (
              <ChevronsUpDown size={16} aria-hidden="true" />
            )}
            Série
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-28 flex-1"
            aria-expanded={todasTurmasAbertas}
            aria-label={`${todasTurmasAbertas ? "Recolher" : "Expandir"} todas as turmas`}
            disabled={buscando || grupos.length === 0}
            onClick={alternarTurmas}
          >
            {todasTurmasAbertas ? (
              <ChevronsDownUp size={16} aria-hidden="true" />
            ) : (
              <ChevronsUpDown size={16} aria-hidden="true" />
            )}
            Turma
          </Button>
          <Button
            type="button"
            className="min-h-11 min-w-44 flex-[2]"
            onClick={() =>
              avisarInfo(
                "Emissão de relatório em preparação",
                "A geração do relatório em PDF será liberada em breve.",
                "emitir-relatorio-por-aluno",
              )
            }
          >
            <FileText size={16} aria-hidden="true" />
            Emitir relatório
          </Button>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="superficie-vidro flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center">
          <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum aluno encontrado</p>
          <p className="text-muted-foreground text-sm">Ajuste a busca.</p>
        </div>
      ) : (
        <div className="superficie-vidro divide-y overflow-hidden">
          {grupos.map(({ serie, turmas: gruposTurma, alunos: totalSerie }) => {
            const serieAberta = buscando || !seriesFechadas.has(serie.id);
            return (
              <section key={serie.id} aria-label={serie.nome}>
                <CabecalhoGrupo
                  nivel="serie"
                  titulo={serie.nome}
                  total={totalSerie}
                  aberto={serieAberta}
                  onAlternar={() => alternarGrupo(seriesFechadas, setSeriesFechadas, serie.id)}
                />
                {serieAberta &&
                  gruposTurma.map(({ turma, linhas: linhasTurma }) => {
                    const turmaAberta = buscando || !turmasFechadas.has(turma.id);
                    return (
                      <section key={turma.id} aria-label={turma.rotulo} className="border-t">
                        <CabecalhoGrupo
                          nivel="turma"
                          titulo={turma.rotulo}
                          total={linhasTurma.length}
                          linhas={linhasTurma}
                          aberto={turmaAberta}
                          onAlternar={() =>
                            alternarGrupo(turmasFechadas, setTurmasFechadas, turma.id)
                          }
                        />
                        {turmaAberta && (
                          <ListaAlunos
                            linhas={linhasTurma}
                            expandido={
                              linhasTurma.some(({ aluno }) => aluno.id === expandido)
                                ? expandido
                                : null
                            }
                            setExpandido={setExpandido}
                            rotuloTurma={rotuloTurma}
                            acumuladoDe={acumuladoDe}
                            resumo={resumo}
                            dias={dias}
                            porDia={porDia}
                            horarios={horarios}
                            saidas={saidas}
                          />
                        )}
                      </section>
                    );
                  })}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
