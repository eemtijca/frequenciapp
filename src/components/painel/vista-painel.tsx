"use client";

// Painel do dia: infrequência por série e por turma, cobertura das chamadas
// e resumo de faltas, justificadas e saídas.
import { useEffect, useMemo, useState } from "react";
import { ChartPie, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import type {
  Aluno,
  Configuracoes,
  Frequencia,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import {
  alunoDesistenteNoDia,
  diaSeguinte,
  exibirOrigemNaChamada,
  rotuloDiaSemana,
} from "@/domain/frequencia";
import {
  coberturaDoDia,
  desistenciasNoDia,
  distribuicaoDoDia,
  distribuicaoPorOrigem,
  marcasDoDia,
  resumoDoDia,
} from "@/domain/relatorios";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import GraficoRosca from "@/components/painel/grafico-rosca";
import VistaPeriodo from "@/components/painel/vista-periodo";
import FaixaGraficos from "@/components/painel/faixa-graficos";

interface Props {
  ativo: boolean;
  diaCorrente: string;
  mes: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  configuracoes: Configuracoes;
  onRecarregar: (mes: string) => Promise<void>;
}

const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function VistaPainel({
  ativo,
  diaCorrente,
  mes,
  series,
  turmas,
  alunos,
  frequencias,
  saidas,
  configuracoes,
  onRecarregar,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
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

  const ativos = useMemo(
    () => alunos.filter((aluno) => aluno.ativo && !alunoDesistenteNoDia(aluno, dia)),
    [alunos, dia],
  );
  const desistencias = useMemo(
    () => desistenciasNoDia(series, turmas, alunos, dia),
    [series, turmas, alunos, dia],
  );
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
    () => distribuicaoDoDia(series, turmas, ativos, marcas),
    [series, turmas, ativos, marcas],
  );
  const cobertura = useMemo(
    () => coberturaDoDia(turmas, ativos, frequenciasDoDia),
    [turmas, ativos, frequenciasDoDia],
  );

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

  function graficoDoDia(serieSelecionada: Serie | null) {
    const distribuicaoDaSerie = serieSelecionada
      ? (distribuicao.find((item) => item.serieId === serieSelecionada.id) ?? null)
      : null;
    const turmasPendentes = serieSelecionada
      ? cobertura.turmasPendentes.filter((turma) => turma.serieId === serieSelecionada.id)
      : cobertura.turmasPendentes;
    // A turma original aparece somente nas séries indicadas em Origem na Chamada.
    const porOrigem =
      serieSelecionada &&
      turmas.some(
        (turma) =>
          turma.serieId === serieSelecionada.id && exibirOrigemNaChamada(configuracoes, turma),
      )
        ? distribuicaoPorOrigem(serieSelecionada, turmas, ativos, marcas)
        : null;
    const coberturaRegistrados = distribuicaoDaSerie?.registrados ?? cobertura.registrados;
    const coberturaEsperados = distribuicaoDaSerie?.esperados ?? cobertura.esperados;
    return carregandoPainel ? (
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
              {serieSelecionada && distribuicaoDaSerie
                ? `${distribuicaoDaSerie.faltas + distribuicaoDaSerie.justificadas} `
                : `${resumo.ausencias} `}
              {(serieSelecionada && distribuicaoDaSerie
                ? distribuicaoDaSerie.faltas + distribuicaoDaSerie.justificadas
                : resumo.ausencias) === 1
                ? "falta"
                : "faltas"}{" "}
              (F + FJ)
            </span>
          </div>
          <GraficoRosca
            titulo={
              serieSelecionada
                ? `Faltas do dia por turma da ${serieSelecionada.nome}`
                : "Faltas do dia por série"
            }
            fatias={
              distribuicaoDaSerie
                ? distribuicaoDaSerie.turmas.map((turma) => ({
                    nome: turma.rotulo,
                    valor: turma.faltas + turma.justificadas,
                    detalhe: `${turma.registrados} de ${turma.esperados} com chamada`,
                  }))
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

        {serieSelecionada && porOrigem && (
          <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-medium">
                <ChartPie size={18} className="text-muted-foreground" aria-hidden="true" />
                {serieSelecionada.nome} por turma original
              </h2>
              <span className="text-muted-foreground text-xs">
                Mesmas faltas, agrupadas pela turma de origem
              </span>
            </div>
            <GraficoRosca
              titulo={`Faltas do dia por turma original da ${serieSelecionada.nome}`}
              fatias={porOrigem.map((turma) => ({
                nome: turma.rotulo,
                valor: turma.faltas + turma.justificadas,
                detalhe: `${turma.registrados} de ${turma.esperados} com chamada`,
              }))}
              vazio={
                frequenciasDoDia.length === 0
                  ? "Nenhuma chamada salva neste dia"
                  : "Nenhuma falta registrada neste dia"
              }
            />
          </div>
        )}

        <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Cobertura do dia</h2>
            <span className="numerais-tabulares text-muted-foreground text-sm">
              {coberturaRegistrados} de {coberturaEsperados} alunos com chamada salva
            </span>
          </div>
          {turmasPendentes.length > 0 ? (
            <>
              <p className="text-muted-foreground text-sm">
                Falta salvar a chamada de {turmasPendentes.length}{" "}
                {turmasPendentes.length === 1 ? "turma" : "turmas"}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {turmasPendentes.map((turma) => (
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
              {coberturaEsperados === 0
                ? "Nenhum aluno ativo cadastrado."
                : "Todas as turmas com alunos têm chamada salva neste dia."}
            </p>
          )}
        </div>
      </>
    );
  }

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
        role="group"
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

      <FaixaGraficos
        ativo={ativo}
        cartoes={[
          { id: "escola", nome: "Toda a escola", conteudo: graficoDoDia(null) },
          ...series.map((serie) => ({
            id: serie.id,
            nome: serie.nome,
            conteudo: graficoDoDia(serie),
          })),
          {
            id: "personalizado",
            nome: "Personalizado",
            conteudo: (
              <VistaPeriodo
                diaCorrente={diaCorrente}
                series={series}
                turmas={turmas}
                alunos={alunos}
              />
            ),
          },
          {
            id: "desistentes",
            nome: "Desistentes",
            conteudo: (
              <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">Desistentes até este dia</h2>
                  <span className="numerais-tabulares text-muted-foreground text-sm">
                    {desistencias.total} {desistencias.total === 1 ? "aluno" : "alunos"}
                  </span>
                </div>
                <GraficoRosca
                  titulo="Desistentes por série"
                  fatias={desistencias.series.map((serie) => ({
                    nome: serie.nome,
                    valor: serie.turmas.reduce((soma, turma) => soma + turma.quantidade, 0),
                  }))}
                  rotuloTotal="desistentes"
                  unidadeSingular="desistente"
                  unidadePlural="desistentes"
                  vazio="Nenhum aluno desistente até este dia"
                />
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
