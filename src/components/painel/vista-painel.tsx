"use client";

// Painel do dia: infrequência por série e por turma, cobertura das chamadas
// e destaque para a infrequência do dia.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarOff, ChartPie, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
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
  diaDeChamadaVizinho,
  exibirOrigemNaChamada,
  rotuloDiaSemana,
  ultimoDiaDeChamada,
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
import { estadoDeErro } from "@/lib/estado-http";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";
import VistaPeriodo from "@/components/painel/vista-periodo";
import FaixaGraficos from "@/components/painel/faixa-graficos";
import { IndicadorCobertura } from "@/components/painel/indicador-cobertura";

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
  // Domingo não tem chamada: aos domingos o painel abre no sábado anterior.
  const diaPadrao = ultimoDiaDeChamada(diaCorrente);
  const [dia, setDia] = useState(diaPadrao);
  const [doDia, setDoDia] = useState<{
    dia: string;
    frequencias: Frequencia[];
    saidas: SaidaAntecipada[];
    feriado?: Feriado | null;
    nomeFeriadoNoCadastro: string;
  } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [recarregar, setRecarregar] = useState(0);

  const compartilhado = dia.startsWith(mes);
  const feriadoCadastrado = feriadoNaData(configuracoes.feriados, dia);
  const nomeFeriadoNoCadastro = feriadoCadastrado?.nome ?? "";
  const feriado =
    doDia?.dia === dia &&
    doDia.nomeFeriadoNoCadastro === nomeFeriadoNoCadastro &&
    doDia.feriado !== undefined
      ? doDia.feriado
      : feriadoCadastrado;

  useEffect(() => {
    let viva = true;
    async function buscar() {
      setCarregando(true);
      setErro("");
      try {
        const [respostaFrequencias, respostaSaidas] = await Promise.all([
          pedir<{ frequencias: Frequencia[]; feriado?: Feriado | null }>(
            `/api/frequencias?dia=${dia}`,
          ),
          compartilhado
            ? Promise.resolve({ saidas: [] as SaidaAntecipada[] })
            : pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?dia=${dia}`),
        ]);
        if (!viva) return;
        setDoDia({
          dia,
          frequencias: respostaFrequencias.frequencias,
          saidas: respostaSaidas.saidas,
          feriado: respostaFrequencias.feriado,
          nomeFeriadoNoCadastro,
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
  }, [compartilhado, dia, recarregar, nomeFeriadoNoCadastro]);

  const frequenciasDoDia = useMemo(
    () =>
      compartilhado
        ? frequencias.filter((frequencia) => frequencia.dia === dia)
        : doDia?.dia === dia
          ? doDia.frequencias
          : [],
    [compartilhado, dia, frequencias, doDia],
  );
  const saidasDoDia = useMemo(
    () =>
      compartilhado
        ? saidas.filter((saida) => saida.dia === dia)
        : doDia?.dia === dia
          ? doDia.saidas
          : [],
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
    () => coberturaDoDia(turmas, ativos, frequenciasDoDia, Boolean(feriado)),
    [turmas, ativos, frequenciasDoDia, feriado],
  );

  const rotuloDia = dia.split("-").reverse().join("/");
  const diaDaSemana = dia ? rotuloDiaSemana(dia) : "";
  const carregandoPainel = carregando && !compartilhado;

  // O painel se atualiza sozinho: a cada minuto e ao voltar para a aba do
  // navegador, sem botão. Sem rede não tenta, e sessão expirada segue o
  // tratamento das consultas.
  const emAtualizacao = useRef(false);
  const atualizarEmSilencio = useCallback(async () => {
    if (emAtualizacao.current) return;
    emAtualizacao.current = true;
    try {
      if (compartilhado) await onRecarregar(mes);
    } catch {
      // Mantém os números atuais até a próxima tentativa.
    } finally {
      setRecarregar((valor) => valor + 1);
      emAtualizacao.current = false;
    }
  }, [compartilhado, mes, onRecarregar]);

  useEffect(() => {
    if (!ativo) return;
    const quandoVisivel = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void atualizarEmSilencio();
    };
    const intervalo = window.setInterval(quandoVisivel, 60_000);
    document.addEventListener("visibilitychange", quandoVisivel);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", quandoVisivel);
    };
  }, [ativo, atualizarEmSilencio]);

  function graficoDoDia(serieSelecionada: Serie | null) {
    const distribuicaoDaSerie = serieSelecionada
      ? (distribuicao.find((item) => item.serieId === serieSelecionada.id) ?? null)
      : null;
    const coberturaTurmas = serieSelecionada
      ? cobertura.turmas.filter((item) => item.turma.serieId === serieSelecionada.id)
      : cobertura.turmas;
    // A turma original aparece somente nas séries indicadas em Origem na Chamada.
    const porOrigem =
      serieSelecionada &&
      turmas.some(
        (turma) =>
          turma.serieId === serieSelecionada.id && exibirOrigemNaChamada(configuracoes, turma),
      )
        ? distribuicaoPorOrigem(serieSelecionada, turmas, ativos, marcas)
        : null;
    return feriado ? (
      <IndicadorCobertura turmas={[]} feriado={feriado.nome} />
    ) : carregandoPainel ? (
      <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        Carregando indicadores...
      </div>
    ) : (
      <>
        <div className="superficie-vidro flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-medium">
              <ChartPie size={18} className="text-muted-foreground" aria-hidden="true" />
              {serieSelecionada ? serieSelecionada.nome : "Toda a escola"}
            </h2>
          </div>
          <GraficoRosca
            tomValores="falta"
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
                    alunos: turma.esperados,
                    detalhe: `${turma.registrados} de ${turma.esperados} alunos com chamada`,
                  }))
                : distribuicao.map((item) => ({
                    nome: item.nome,
                    valor: item.faltas + item.justificadas,
                    alunos: item.esperados,
                    detalhe: `${item.registrados} de ${item.esperados} alunos com chamada`,
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
          <div className="superficie-vidro flex flex-col gap-4 p-4">
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
              tomValores="falta"
              titulo={`Faltas do dia por turma original da ${serieSelecionada.nome}`}
              fatias={porOrigem.map((turma) => ({
                nome: turma.rotulo,
                valor: turma.faltas + turma.justificadas,
                alunos: turma.esperados,
                detalhe: `${turma.registrados} de ${turma.esperados} alunos com chamada`,
              }))}
              vazio={
                frequenciasDoDia.length === 0
                  ? "Nenhuma chamada salva neste dia"
                  : "Nenhuma falta registrada neste dia"
              }
            />
          </div>
        )}

        <IndicadorCobertura turmas={coberturaTurmas} />
      </>
    );
  }

  return (
    <section aria-label="Painel de frequência" className="flex flex-col gap-4 pb-6">
      <h1 className="sr-only">Painel</h1>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia anterior"
          onClick={() => setDia((atual) => diaDeChamadaVizinho(atual, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="dia-painel"
            modo="dia"
            valor={dia}
            max={diaCorrente}
            semDomingo
            rotuloAcessivel="Dia do painel"
            rotulo={rotuloDia}
            detalhe={diaDaSemana}
            onValor={setDia}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia seguinte"
          disabled={dia >= diaPadrao}
          onClick={() => setDia((atual) => diaDeChamadaVizinho(atual, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {dia !== diaPadrao && (
        <button
          type="button"
          onClick={() => setDia(diaPadrao)}
          className="text-primary pressionavel self-start text-sm font-medium hover:underline"
        >
          Voltar para hoje
        </button>
      )}

      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}

      <div
        role="group"
        className="superficie-vidro flex min-h-24 items-center justify-between gap-4 px-5 py-4"
        aria-label="Resumo do dia"
        aria-busy={carregandoPainel}
      >
        <h2 className="min-w-0 font-medium">Infrequência do dia</h2>
        <span
          className={
            !feriado && resumo.registrados > 0
              ? "numerais-tabulares shrink-0 text-3xl font-semibold sm:text-4xl"
              : "text-muted-foreground shrink-0 text-sm"
          }
        >
          {feriado ? (
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <CalendarOff aria-hidden="true" className="size-4 shrink-0" />
              Feriado
            </span>
          ) : carregandoPainel ? (
            ""
          ) : resumo.registrados > 0 ? (
            percentual.format(resumo.infrequencia)
          ) : (
            "Sem dados"
          )}
        </span>
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
              <div className="superficie-vidro flex flex-col gap-4 p-4">
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
