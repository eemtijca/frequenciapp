"use client";

// Relatório conjunto de saídas e entradas, com consulta independente do mês e grupos por turma ou por aluno.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  diaDaSemanaIso,
  diaSeguinte,
  rotuloData,
  rotuloMomento,
  type Turma,
} from "@/domain/frequencia";
import {
  LIMITE_DIAS_RELATORIO_MOVIMENTACOES,
  movimentacoesPorAluno,
  type FiltroMovimentacoesPorAluno,
  type MovimentacaoRelatorio,
  type RelatorioMovimentacoes,
} from "@/domain/relatorio-movimentacoes";
import { pedir } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { cn } from "@/lib/utils";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";

type Modo = "dia" | "semana" | "periodo";
type Agrupamento = "turma" | "aluno";
interface Carga {
  chave: string;
  dados: RelatorioMovimentacoes | null;
  erro: string;
  variante: VarianteEstado;
}

const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: "turma", rotulo: "Por turma" },
  { valor: "aluno", rotulo: "Por aluno" },
];

const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "periodo", rotulo: "Período personalizado" },
];

/** Uma saída ou entrada, com o aluno quando o grupo é a turma. */
function LinhaMovimentacao({ item, comAluno }: { item: MovimentacaoRelatorio; comAluno: boolean }) {
  return (
    <li className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium",
              item.tipo === "ENTRADA"
                ? "border-primary/25 bg-primary/10 text-primary"
                : "bg-muted/40 text-foreground",
            )}
          >
            {item.tipo === "ENTRADA" ? (
              <ArrowDownLeft size={14} aria-hidden="true" />
            ) : (
              <ArrowUpRight size={14} aria-hidden="true" />
            )}
            {item.tipo === "ENTRADA" ? "Entrada" : "Saída"}
          </span>
          <time dateTime={item.dia} className="text-muted-foreground numerais-tabulares">
            {rotuloData(item.dia)}
          </time>
          {item.horario && <span className="numerais-tabulares">{item.horario}</span>}
        </div>
        {comAluno && <p className="font-medium wrap-anywhere">{item.alunoNome}</p>}
        {item.momento && (
          <p className="text-muted-foreground text-xs">{rotuloMomento(item.momento)}</p>
        )}
      </div>
      <dl className="min-w-0 space-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Motivo</dt>
          <dd className="wrap-anywhere">{item.motivo || "Não informado"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            {item.tipo === "SAIDA" ? "Liberado por" : "Responsável pelo registro"}
          </dt>
          <dd className="wrap-anywhere">{item.responsavel ?? "Não informado"}</dd>
        </div>
      </dl>
    </li>
  );
}

export default function VistaMovimentacoes({
  hoje,
  turmas,
  ativa,
}: {
  hoje: string;
  turmas: Turma[];
  ativa: boolean;
}) {
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(hoje);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [turmaId, setTurmaId] = useState("todas");
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("turma");
  const [buscaAluno, setBuscaAluno] = useState("");
  const [filtroAluno, setFiltroAluno] = useState<FiltroMovimentacoesPorAluno>("todas");
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [atividadeAnterior, setAtividadeAnterior] = useState(ativa);
  // Uma visita nova consulta os registros atualizados, mantendo apenas os filtros.
  if (atividadeAnterior !== ativa) {
    setAtividadeAnterior(ativa);
    setCarga(null);
  }
  const segunda = diaSeguinte(dia, -(diaDaSemanaIso(dia) - 1));
  const domingo = diaSeguinte(segunda, 6);
  const de = modo === "periodo" ? inicio : modo === "semana" ? segunda : dia;
  const ate =
    modo === "periodo" ? fim : modo === "semana" ? (domingo > hoje ? hoje : domingo) : dia;
  const dias =
    Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
  const erroPeriodo =
    ate < de
      ? "A data final deve ser igual ou posterior à inicial."
      : dias > LIMITE_DIAS_RELATORIO_MOVIMENTACOES
        ? `Escolha um período de até ${LIMITE_DIAS_RELATORIO_MOVIMENTACOES} dias.`
        : de > hoje || ate > hoje
          ? "Escolha um período até hoje."
          : "";
  const parametros = new URLSearchParams({ de, ate });
  if (turmaId !== "todas") parametros.set("turmaId", turmaId);
  const consulta = parametros.toString();
  const chave = `${consulta}|${recarga}`;
  const atual = carga?.chave === chave ? carga : null;
  const carregando = ativa && !erroPeriodo && !atual;
  const dados = !erroPeriodo ? atual?.dados : null;

  useEffect(() => {
    if (!ativa || erroPeriodo) return;
    const controlador = new AbortController();
    pedir<RelatorioMovimentacoes>(`/api/relatorios/movimentacoes?${consulta}`, {
      signal: controlador.signal,
    })
      .then((dados) => {
        if (!controlador.signal.aborted)
          setCarga({ chave, dados, erro: "", variante: "indisponivel" });
      })
      .catch((erro: unknown) => {
        if (!controlador.signal.aborted)
          setCarga({
            chave,
            dados: null,
            erro: mensagemAmigavel(erro, "Não foi possível carregar o relatório."),
            variante: estadoDeErro(erro),
          });
      });
    return () => controlador.abort();
  }, [ativa, chave, consulta, erroPeriodo]);

  const porAluno = useMemo(
    () => (dados ? movimentacoesPorAluno(dados.turmas, filtroAluno, buscaAluno) : []),
    [dados, filtroAluno, buscaAluno],
  );
  const nomePeriodo = modo === "semana" ? "Semana" : "Dia";
  const passo = modo === "semana" ? 7 : 1;
  const proximoInicio = diaSeguinte(modo === "semana" ? segunda : dia, passo);

  return (
    <section
      aria-label="Relatório de saídas e entradas"
      aria-busy={carregando}
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Saídas e entradas</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Atualizar saídas e entradas"
          disabled={carregando || Boolean(erroPeriodo)}
          onClick={() => setRecarga((valor) => valor + 1)}
        >
          {carregando ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
        </Button>
      </div>
      <div role="group" aria-label="Período do relatório" className="flex flex-wrap gap-2">
        {MODOS.map((item) => (
          <Button
            key={item.valor}
            type="button"
            variant={modo === item.valor ? "default" : "outline"}
            aria-pressed={modo === item.valor}
            onClick={() => setModo(item.valor)}
            className="min-h-11"
          >
            {item.rotulo}
          </Button>
        ))}
      </div>
      <div role="group" aria-label="Agrupamento do relatório" className="flex flex-wrap gap-2">
        {AGRUPAMENTOS.map((item) => (
          <Button
            key={item.valor}
            type="button"
            variant={agrupamento === item.valor ? "default" : "outline"}
            aria-pressed={agrupamento === item.valor}
            onClick={() => setAgrupamento(item.valor)}
            className="min-h-11"
          >
            {item.rotulo}
          </Button>
        ))}
      </div>
      <div className="superficie-vidro grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {modo === "periodo" ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="movimentacoes-de">Data inicial</Label>
              <SeletorPeriodo
                id="movimentacoes-de"
                modo="dia"
                valor={inicio}
                max={hoje}
                rotuloAcessivel="Data inicial do relatório"
                rotulo={rotuloData(inicio)}
                onValor={setInicio}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="movimentacoes-ate">Data final</Label>
              <SeletorPeriodo
                id="movimentacoes-ate"
                modo="dia"
                valor={fim}
                max={hoje}
                rotuloAcessivel="Data final do relatório"
                rotulo={rotuloData(fim)}
                onValor={setFim}
              />
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            <Label htmlFor="movimentacoes-dia">
              {modo === "semana" ? "Semana da data" : "Data"}
            </Label>
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label={`${nomePeriodo} anterior do relatório`}
                onClick={() => setDia(diaSeguinte(dia, -passo))}
              >
                <ChevronLeft size={18} />
              </Button>
              <div className="min-w-0 flex-1">
                <SeletorPeriodo
                  id="movimentacoes-dia"
                  modo="dia"
                  valor={dia}
                  max={hoje}
                  rotuloAcessivel="Data do relatório"
                  rotulo={rotuloData(dia)}
                  onValor={setDia}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label={`${nomePeriodo === "Semana" ? "Próxima semana" : "Próximo dia"} do relatório`}
                disabled={proximoInicio > hoje}
                onClick={() =>
                  setDia(diaSeguinte(dia, passo) > hoje ? hoje : diaSeguinte(dia, passo))
                }
              >
                <ChevronRight size={18} />
              </Button>
            </div>
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <Label htmlFor="movimentacoes-turma">Turma</Label>
          <Selecionar
            id="movimentacoes-turma"
            ariaLabel="Turma do relatório de movimentações"
            value={turmaId}
            onValueChange={setTurmaId}
            opcoes={[
              { valor: "todas", rotulo: "Todas as turmas" },
              ...turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
            ]}
          />
        </div>
        {agrupamento === "aluno" && (
          <>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="movimentacoes-busca">Buscar aluno</Label>
              <BarraBusca
                id="movimentacoes-busca"
                valor={buscaAluno}
                onValor={setBuscaAluno}
                placeholder="Digite o nome"
                rotulo="Buscar aluno no relatório"
                className="border-0 px-0 py-0"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="movimentacoes-filtro">Mostrar</Label>
              <Selecionar
                id="movimentacoes-filtro"
                ariaLabel="Filtro de alunos do relatório"
                value={filtroAluno}
                onValueChange={(valor) =>
                  setFiltroAluno(valor === "repetidas" ? "repetidas" : "todas")
                }
                opcoes={[
                  { valor: "todas", rotulo: "Todos com movimentações" },
                  { valor: "repetidas", rotulo: "Duas ou mais no período" },
                ]}
              />
            </div>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {de === ate ? rotuloData(de) : `${rotuloData(de)} a ${rotuloData(ate)}`}
        {modo === "semana" && (domingo > hoje ? " · Semana até hoje" : " · Segunda a domingo")}
      </p>
      {erroPeriodo ? (
        <p role="alert" className="text-falta-texto text-sm">
          {erroPeriodo}
        </p>
      ) : carregando ? (
        <p
          role="status"
          className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
        >
          <LoaderCircle size={18} className="animate-spin" /> Carregando saídas e entradas...
        </p>
      ) : atual?.erro ? (
        <AvisoCompacto
          variante={atual.variante}
          titulo="Relatório indisponível"
          descricao={atual.erro}
          acao={{ rotulo: "Tentar de novo", onClick: () => setRecarga((valor) => valor + 1) }}
        />
      ) : (
        dados && (
          <>
            <dl aria-label="Totais de movimentações" className="grid grid-cols-2 gap-3">
              <div className="superficie-vidro p-4">
                <dt className="text-muted-foreground text-sm">Saídas</dt>
                <dd className="numerais-tabulares mt-1 text-2xl font-semibold">
                  {dados.totais.saidas}
                </dd>
              </div>
              <div className="superficie-vidro p-4">
                <dt className="text-muted-foreground text-sm">Entradas</dt>
                <dd className="numerais-tabulares mt-1 text-2xl font-semibold">
                  {dados.totais.entradas}
                </dd>
              </div>
            </dl>
            {dados.turmas.length === 0 ? (
              <p className="superficie-vidro text-muted-foreground p-6 text-center text-sm">
                Nenhuma saída ou entrada neste período.
              </p>
            ) : agrupamento === "aluno" ? (
              porAluno.length === 0 ? (
                <p className="superficie-vidro text-muted-foreground p-6 text-center text-sm">
                  Nenhum aluno encontrado com estes filtros.
                </p>
              ) : (
                porAluno.map((aluno) => (
                  <section
                    key={aluno.alunoId}
                    aria-label={`Aluno ${aluno.alunoNome}`}
                    className="superficie-vidro min-w-0 overflow-hidden"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold wrap-anywhere">{aluno.alunoNome}</h3>
                        <p className="text-muted-foreground text-xs wrap-anywhere">
                          {aluno.turmas.join(" · ")}
                        </p>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {aluno.saidas} {aluno.saidas === 1 ? "saída" : "saídas"} · {aluno.entradas}{" "}
                        {aluno.entradas === 1 ? "entrada" : "entradas"}
                      </p>
                    </header>
                    <ul className="divide-y">
                      {aluno.movimentacoes.map((item) => (
                        <LinhaMovimentacao
                          key={`${item.tipo}:${item.id}`}
                          item={item}
                          comAluno={false}
                        />
                      ))}
                    </ul>
                  </section>
                ))
              )
            ) : (
              dados.turmas.map((grupo) => (
                <section
                  key={`${grupo.turmaId}:${grupo.turmaRotulo}`}
                  aria-label={`Turma ${grupo.turmaRotulo}`}
                  className="superficie-vidro min-w-0 overflow-hidden"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <h3 className="font-semibold wrap-anywhere">{grupo.turmaRotulo}</h3>
                    <p className="text-muted-foreground text-xs">
                      {grupo.saidas} {grupo.saidas === 1 ? "saída" : "saídas"} · {grupo.entradas}{" "}
                      {grupo.entradas === 1 ? "entrada" : "entradas"}
                    </p>
                  </header>
                  <ul className="divide-y">
                    {grupo.movimentacoes.map((item) => (
                      <LinhaMovimentacao key={`${item.tipo}:${item.id}`} item={item} comAluno />
                    ))}
                  </ul>
                </section>
              ))
            )}
            <p className="text-muted-foreground text-xs">
              {agrupamento === "aluno"
                ? "Cada aluno reúne as saídas e as entradas do período, em todas as turmas."
                : "Entradas agrupadas pela turma no registro; saídas pela turma atual do aluno."}
            </p>
          </>
        )
      )}
    </section>
  );
}
