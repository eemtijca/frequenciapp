"use client";

// Painel do dia: infrequência por série e por turma, cobertura das chamadas
// e resumo de faltas, justificadas e saídas.
import { useEffect, useMemo, useState } from "react";
import { ChartPie, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import type { Aluno, Frequencia, SaidaAntecipada, Serie, Turma } from "@/domain/frequencia";
import { diaSeguinte, rotuloDiaSemana } from "@/domain/frequencia";
import { coberturaDoDia, distribuicaoDoDia, marcasDoDia, resumoDoDia } from "@/domain/relatorios";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import GraficoRosca from "@/components/painel/grafico-rosca";

interface Props {
  diaCorrente: string;
  mes: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  onRecarregar: (mes: string) => Promise<void>;
}

const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function VistaPainel({
  diaCorrente,
  mes,
  series,
  turmas,
  alunos,
  frequencias,
  saidas,
  onRecarregar,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
  const [filtro, setFiltro] = useState<"escola" | string>("escola");
  const [doDia, setDoDia] = useState<{
    frequencias: Frequencia[];
    saidas: SaidaAntecipada[];
  } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [recarregar, setRecarregar] = useState(0);

  const compartilhado = dia.startsWith(mes);

  useEffect(() => {
    if (compartilhado) return;
    let viva = true;
    async function buscar() {
      setCarregando(true);
      setErro("");
      try {
        const [respostaFrequencias, respostaSaidas] = await Promise.all([
          pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?dia=${dia}`),
          pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?dia=${dia}`),
        ]);
        if (!viva) return;
        setDoDia({
          frequencias: respostaFrequencias.frequencias,
          saidas: respostaSaidas.saidas,
        });
      } catch (excecao) {
        if (viva) {
          setErro(
            excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar o dia.",
          );
          setErroVariante(estadoDeErro(excecao));
        }
      } finally {
        if (viva) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      viva = false;
    };
  }, [compartilhado, dia, recarregar]);

  const frequenciasDoDia = useMemo(
    () =>
      compartilhado
        ? frequencias.filter((frequencia) => frequencia.dia === dia)
        : (doDia?.frequencias ?? []),
    [compartilhado, dia, frequencias, doDia],
  );
  const saidasDoDia = useMemo(
    () => (compartilhado ? saidas.filter((saida) => saida.dia === dia) : (doDia?.saidas ?? [])),
    [compartilhado, dia, saidas, doDia],
  );

  const ativos = useMemo(() => alunos.filter((aluno) => aluno.ativo), [alunos]);
  const horarios = useMemo(() => turmas.flatMap((turma) => turma.horarios), [turmas]);
  const marcas = useMemo(
    () => marcasDoDia(ativos, dia, frequenciasDoDia, horarios),
    [ativos, dia, frequenciasDoDia, horarios],
  );
  const resumo = useMemo(
    () => resumoDoDia(marcas, ativos.length, saidasDoDia),
    [marcas, ativos.length, saidasDoDia],
  );
  const distribuicao = useMemo(
    () => distribuicaoDoDia(series, turmas, alunos, marcas),
    [series, turmas, alunos, marcas],
  );
  const cobertura = useMemo(
    () => coberturaDoDia(turmas, alunos, frequenciasDoDia),
    [turmas, alunos, frequenciasDoDia],
  );

  const serieSelecionada = series.find((serie) => serie.id === filtro) ?? null;
  const rotuloDia = dia.split("-").reverse().join("/");
  const diaDaSemana = dia ? rotuloDiaSemana(dia) : "";
  const carregandoPainel = carregando && !compartilhado;

  const { executando: atualizando, executar: atualizar } = useAcaoUnica(async () => {
    setErro("");
    try {
      if (compartilhado) await onRecarregar(mes);
      else setRecarregar((valor) => valor + 1);
    } catch (excecao) {
      setErro("Não foi possível atualizar os indicadores.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível atualizar os indicadores." });
    }
  });

  return (
    <section aria-label="Painel de frequência" className="flex flex-col gap-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
          <p className="text-muted-foreground text-sm">
            Infrequência em <span className="numerais-tabulares">{rotuloDia}</span>
            {diaDaSemana && <span className="hidden sm:inline"> · {diaDaSemana}</span>}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Atualizar indicadores"
          onClick={() => void atualizar()}
          disabled={atualizando || carregandoPainel}
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
          aria-label="Dia anterior"
          onClick={() => setDia((atual) => diaSeguinte(atual, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="dia-painel"
            modo="dia"
            valor={dia}
            max={diaCorrente}
            rotuloAcessivel="Dia do painel"
            rotulo={rotuloDia}
            detalhe={diaDaSemana}
            onValor={setDia}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label="Dia seguinte"
          disabled={dia >= diaCorrente}
          onClick={() => setDia((atual) => diaSeguinte(atual, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {dia !== diaCorrente && (
        <button
          type="button"
          onClick={() => setDia(diaCorrente)}
          className="text-primary pressionavel self-start text-sm font-medium hover:underline"
        >
          Voltar para hoje
        </button>
      )}

      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        aria-label="Resumo do dia"
      >
        <div className="bg-card flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2">
          <span className="numerais-tabulares text-2xl font-semibold">
            {carregandoPainel ? "" : resumo.esperados}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Alunos</span>
        </div>
        <div className="bg-card flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2">
          <span className="numerais-tabulares text-primary text-2xl font-semibold">
            {carregandoPainel ? "" : resumo.presentes}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Presentes</span>
        </div>
        <div className="bg-card flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2">
          <span className="numerais-tabulares text-falta-texto text-2xl font-semibold">
            {carregandoPainel ? "" : resumo.ausencias}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Faltas (F + FJ)</span>
        </div>
        <div className="bg-card flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2">
          <span className="numerais-tabulares text-2xl font-semibold">
            {carregandoPainel ? "" : resumo.justificadas}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Justificadas</span>
        </div>
        <div className="bg-card flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2">
          <span className="numerais-tabulares text-2xl font-semibold">
            {carregandoPainel ? "" : percentual.format(resumo.infrequencia)}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Infrequência</span>
        </div>
        <div className="bg-card flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2">
          <span className="numerais-tabulares text-2xl font-semibold">
            {carregandoPainel ? "" : resumo.saidas}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Saídas</span>
        </div>
      </div>

      <div role="group" aria-label="Filtro por série" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filtro === "escola"}
          onClick={() => setFiltro("escola")}
          className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground pressionavel flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
        >
          Escola
        </button>
        {series.map((serie) => (
          <button
            key={serie.id}
            type="button"
            aria-pressed={filtro === serie.id}
            onClick={() => setFiltro(serie.id)}
            className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground pressionavel flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            {serie.nome}
          </button>
        ))}
      </div>

      {carregandoPainel ? (
        <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando indicadores...
        </div>
      ) : (
        <>
          <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-medium">
                <ChartPie size={18} className="text-muted-foreground" aria-hidden="true" />
                {serieSelecionada ? serieSelecionada.nome : "Toda a escola"}
              </h2>
              <span className="text-muted-foreground text-xs">
                {resumo.ausencias} {resumo.ausencias === 1 ? "falta" : "faltas"} (F + FJ)
              </span>
            </div>
            <GraficoRosca
              titulo={
                serieSelecionada
                  ? `Faltas do dia por turma da ${serieSelecionada.nome}`
                  : "Faltas do dia por série"
              }
              fatias={
                serieSelecionada
                  ? (distribuicao
                      .find((item) => item.serieId === serieSelecionada.id)
                      ?.turmas.map((turma) => ({
                        nome: turma.rotulo,
                        valor: turma.faltas + turma.justificadas,
                        detalhe: `${turma.registrados} de ${turma.esperados} com chamada`,
                      })) ?? [])
                  : distribuicao.map((item) => ({
                      nome: item.nome,
                      valor: item.faltas + item.justificadas,
                      detalhe: `${item.registrados} de ${item.esperados} alunos`,
                    }))
              }
              vazio={
                frequenciasDoDia.length === 0
                  ? "Nenhuma chamada salva neste dia"
                  : "Nenhuma falta registrada neste dia"
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {distribuicao.map((serie) => (
              <div
                key={serie.serieId}
                className="bg-card flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{serie.nome}</h3>
                  <span className="text-muted-foreground numerais-tabulares text-xs">
                    {serie.faltas + serie.justificadas} de {resumo.ausencias || 0}
                    {resumo.ausencias > 0 ? ` · ${percentual.format(serie.percentual)}` : ""}
                  </span>
                </div>
                <GraficoRosca
                  titulo={`Faltas do dia nas turmas da ${serie.nome}`}
                  fatias={serie.turmas.map((turma) => ({
                    nome: turma.rotulo,
                    valor: turma.faltas + turma.justificadas,
                    detalhe: `${turma.registrados}/${turma.esperados}`,
                  }))}
                  vazio="Nenhuma falta nesta série"
                />
                <p className="text-muted-foreground text-xs">
                  {serie.registrados} de {serie.esperados} alunos com chamada salva
                </p>
              </div>
            ))}
          </div>

          <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Cobertura do dia</h2>
              <span className="numerais-tabulares text-muted-foreground text-sm">
                {cobertura.registrados} de {cobertura.esperados} alunos com chamada salva
              </span>
            </div>
            {cobertura.turmasPendentes.length > 0 ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Falta salvar a chamada de {cobertura.turmasPendentes.length}{" "}
                  {cobertura.turmasPendentes.length === 1 ? "turma" : "turmas"}:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cobertura.turmasPendentes.map((turma) => (
                    <span
                      key={turma.id}
                      className="bg-falta-fraca text-falta-texto rounded-md px-2 py-1 text-xs font-medium"
                    >
                      {turma.rotulo}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {cobertura.esperados === 0
                  ? "Nenhum aluno ativo cadastrado."
                  : "Todas as turmas com alunos têm chamada salva neste dia."}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
