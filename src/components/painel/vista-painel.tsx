"use client";

// Painel do dia: infrequência por série e por turma, cobertura das chamadas
// e destaque para a infrequência do dia.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import type {
  Aluno,
  Configuracoes,
  Frequencia,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { alunoDesistenteNoDia, exibirOrigemNaChamada, rotuloDiaSemana } from "@/domain/frequencia";
import {
  coberturaDoDia,
  desistenciasNoDia,
  distribuicaoDoDia,
  distribuicaoPorOrigem,
  limiaresDoPainel,
  marcasDoDia,
  nivelInfrequencia,
  resumoDoDia,
} from "@/domain/relatorios";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { estadoDeErro } from "@/lib/estado-http";
import { Alerta } from "@/components/ui/mui/alerta";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { BarraProgresso } from "@/components/ui/mui/barra-progresso";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoTitulo } from "@/components/ui/mui/cartao";
import type { VarianteEstado } from "@/components/ui/mui/tela-estado";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { VistaResumoSemana } from "@/components/chamada/resumo-semana";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";
import VistaPeriodo from "@/components/painel/vista-periodo";
import FaixaGraficos from "@/components/painel/faixa-graficos";
import { IndicadorCobertura } from "@/components/painel/indicador-cobertura";
import { IndicadorFeriado } from "@/components/painel/indicador-feriado";
import {
  useContextoAtualizacao,
  useAtualizacaoTela,
} from "@/components/atualizacao/contexto-atualizacao";

interface Props {
  ativo: boolean;
  diaCorrente: string;
  fuso: string;
  mes: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  configuracoes: Configuracoes;
  onRecarregar: (mes: string) => Promise<void>;
  onRecarregarConfiguracoes: () => Promise<void>;
}

const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const NIVEIS = {
  baixa: {
    rotulo: "Dentro do esperado",
    tom: "sucesso",
    cor: "success.main",
    Icone: CheckCircleRoundedIcon,
  },
  atencao: {
    rotulo: "Atenção",
    tom: "alerta",
    cor: "alerta.texto",
    Icone: WarningAmberRoundedIcon,
  },
  critica: {
    rotulo: "Acima do limite",
    tom: "falta",
    cor: "falta.texto",
    Icone: ErrorOutlineRoundedIcon,
  },
} as const;

const TEXTO_OCULTO = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const TAMANHO_NAVEGACAO = 44;

function severidadeDoErro(variante: VarianteEstado): "warning" | "error" {
  return variante === "offline" || variante === "indisponivel" ? "warning" : "error";
}

function EsqueletoRosca() {
  return (
    <Stack
      role="status"
      aria-live="polite"
      direction={{ xs: "column", sm: "row" }}
      spacing={2.5}
      sx={{ alignItems: "center", width: "100%" }}
    >
      <Typography sx={TEXTO_OCULTO}>Carregando indicadores...</Typography>
      <Skeleton variant="circular" width={176} height={176} sx={{ flexShrink: 0 }} />
      <Stack spacing={1} sx={{ width: "100%", minWidth: 0 }}>
        <Skeleton variant="rounded" height={44} />
        <Skeleton variant="rounded" height={44} />
        <Skeleton variant="rounded" height={44} />
      </Stack>
    </Stack>
  );
}

export default function VistaPainel({
  ativo,
  diaCorrente,
  fuso,
  mes,
  series,
  turmas,
  alunos,
  frequencias,
  saidas,
  configuracoes,
  onRecarregar,
  onRecarregarConfiguracoes,
}: Props) {
  // No domingo, o painel abre no resumo da semana encerrada.
  const nav = useNavegacaoDoDia({
    diaCorrente,
    max: diaCorrente,
    domingoComoResumo: true,
  });
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const dia = nav.dia;
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
  const marcarPainelAtualizado = useContextoAtualizacao()?.marcarAtualizado;

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
    if (!ativo || nav.resumo) return;
    const controlador = new AbortController();
    let viva = true;
    async function buscar() {
      setCarregando(true);
      setErro("");
      try {
        const [respostaFrequencias, respostaSaidas] = await Promise.all([
          pedir<{ frequencias: Frequencia[]; feriado?: Feriado | null }>(
            `/api/frequencias?dia=${dia}`,
            { signal: controlador.signal },
          ),
          compartilhado
            ? Promise.resolve({ saidas: [] as SaidaAntecipada[] })
            : pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?dia=${dia}`, {
                signal: controlador.signal,
              }),
        ]);
        if (!viva) return;
        setDoDia({
          dia,
          frequencias: respostaFrequencias.frequencias,
          saidas: respostaSaidas.saidas,
          feriado: respostaFrequencias.feriado,
          nomeFeriadoNoCadastro,
        });
        marcarPainelAtualizado?.("painel");
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
      controlador.abort();
    };
  }, [
    ativo,
    compartilhado,
    dia,
    recarregar,
    nomeFeriadoNoCadastro,
    nav.resumo,
    marcarPainelAtualizado,
  ]);

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
  const temDadosDoDia = compartilhado || doDia?.dia === dia;
  const carregandoPainel = carregando && !temDadosDoDia;
  const atualizando = carregando && temDadosDoDia;

  // O painel se atualiza sozinho: a cada minuto e ao voltar para a aba do
  // navegador, sem botão. Sem rede não tenta, e sessão expirada segue o
  // tratamento das consultas.
  const emAtualizacao = useRef(false);
  const atualizarEmSilencio = useCallback(async () => {
    if (emAtualizacao.current) return;
    emAtualizacao.current = true;
    try {
      const tarefas: Promise<unknown>[] = [onRecarregarConfiguracoes()];
      if (!nav.resumo && compartilhado) tarefas.push(onRecarregar(mes));
      await Promise.allSettled(tarefas);
    } finally {
      setRecarregar((valor) => valor + 1);
      emAtualizacao.current = false;
    }
  }, [compartilhado, mes, nav.resumo, onRecarregar, onRecarregarConfiguracoes]);

  useAtualizacaoTela("painel", atualizarEmSilencio);

  useEffect(() => {
    if (!ativo || calendarioAberto || nav.resumo) return;
    const quandoVisivel = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void atualizarEmSilencio();
    };
    const intervalo = window.setInterval(quandoVisivel, 60_000);
    document.addEventListener("visibilitychange", quandoVisivel);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", quandoVisivel);
    };
  }, [ativo, calendarioAberto, nav.resumo, atualizarEmSilencio]);

  const [cartaoAtivo, setCartaoAtivo] = useState("escola");
  const serieAtiva = series.find((item) => item.id === cartaoAtivo) ?? null;
  const coberturaTurmas = serieAtiva
    ? cobertura.turmas.filter((item) => item.turma.serieId === serieAtiva.id)
    : cobertura.turmas;

  function graficoDoDia(serieSelecionada: Serie | null) {
    const distribuicaoDaSerie = serieSelecionada
      ? (distribuicao.find((item) => item.serieId === serieSelecionada.id) ?? null)
      : null;
    // A turma original aparece somente nas séries indicadas em Origem na Chamada.
    const porOrigem =
      serieSelecionada &&
      turmas.some(
        (turma) =>
          turma.serieId === serieSelecionada.id && exibirOrigemNaChamada(configuracoes, turma),
      )
        ? distribuicaoPorOrigem(serieSelecionada, turmas, ativos, marcas)
        : null;
    const titulo = serieSelecionada
      ? `Faltas do dia por turma da ${serieSelecionada.nome}`
      : "Faltas do dia por série";
    const vazio = feriado
      ? feriado.nome
      : frequenciasDoDia.length === 0
        ? "Nenhuma chamada salva neste dia"
        : "Nenhuma falta registrada neste dia";

    if (carregandoPainel) {
      return (
        <Cartao aria-label="Carregando indicadores">
          <CartaoConteudo>
            <EsqueletoRosca />
          </CartaoConteudo>
        </Cartao>
      );
    }

    return (
      <Stack spacing={2}>
        <Cartao aria-label={serieSelecionada ? serieSelecionada.nome : "Toda a escola"}>
          <CartaoConteudo>
            <GraficoRosca
              tomValores="falta"
              titulo={titulo}
              fatias={
                feriado
                  ? []
                  : distribuicaoDaSerie
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
              vazio={vazio}
            />
          </CartaoConteudo>
        </Cartao>

        {!feriado && serieSelecionada && porOrigem && (
          <Cartao aria-label={`${serieSelecionada.nome} por turma original`}>
            <CartaoCabecalho>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Mesmas faltas, agrupadas pela turma de origem
              </Typography>
            </CartaoCabecalho>
            <CartaoConteudo>
              <GraficoRosca
                tomValores="falta"
                titulo={`Faltas do dia por turma original da ${serieSelecionada.nome}`}
                fatias={porOrigem.map((turma) => ({
                  nome: turma.rotulo,
                  valor: turma.faltas + turma.justificadas,
                  alunos: turma.esperados,
                  detalhe: `${turma.registrados} de ${turma.esperados} alunos com chamada`,
                }))}
                vazio={vazio}
              />
            </CartaoConteudo>
          </Cartao>
        )}
      </Stack>
    );
  }

  return (
    <Box component="section" aria-label="Painel de frequência" sx={{ pb: 3 }}>
      <CabecalhoPagina
        titulo="Painel"
        acoes={nav.resumo ? undefined : <AtualizadoDaVisao fuso={fuso} />}
      />

      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <BotaoIcone
            rotulo="Dia anterior"
            icone={<ChevronLeftRoundedIcon />}
            variante="contorno"
            onClick={() => nav.anterior()}
            sx={{
              width: TAMANHO_NAVEGACAO,
              height: TAMANHO_NAVEGACAO,
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <SeletorPeriodo
              id="dia-painel"
              modo="dia"
              valor={nav.resumo ? (nav.domingo ?? "") : dia}
              max={diaCorrente}
              calendarioSemanal
              mostrarSelo={!nav.resumo}
              rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Dia do painel"}
              rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : rotuloDia}
              detalhe={nav.resumo ? "semana" : diaDaSemana}
              aoHoje={() => {
                setCarregando(false);
                nav.voltarParaHoje();
              }}
              hojeAtivo={nav.hojeAtivo}
              onAbertoChange={setCalendarioAberto}
              onValor={(proximo) => nav.escolherDia(proximo)}
            />
          </Box>
          <BotaoIcone
            rotulo="Dia seguinte"
            icone={<ChevronRightRoundedIcon />}
            variante="contorno"
            disabled={nav.seguinteDesabilitado}
            onClick={() => nav.seguinte()}
            sx={{
              width: TAMANHO_NAVEGACAO,
              height: TAMANHO_NAVEGACAO,
              flexShrink: 0,
            }}
          />
        </Stack>

        {nav.mostrarVoltar && (
          <Botao
            type="button"
            variante="contorno"
            icone={<ReplayRoundedIcon />}
            onClick={() => {
              setCarregando(false);
              nav.voltarParaHoje();
            }}
            sx={{ alignSelf: "flex-start" }}
          >
            Voltar para hoje
          </Botao>
        )}

        {nav.resumo && nav.semana ? (
          <VistaResumoSemana
            turmas={turmas}
            alunos={alunos}
            dias={nav.semana}
            domingo={nav.domingo}
            feriados={configuracoes.feriados}
            configuracoes={configuracoes}
            mostrarSaidas={configuracoes.saidaAntecipada}
            versao={recarregar}
            contexto="painel"
            ativo={ativo}
            pausado={calendarioAberto}
            viewId="painel"
            fuso={fuso}
            onRecarregarConfiguracoes={onRecarregarConfiguracoes}
            onAbrirDia={(proximo) => nav.escolherDia(proximo)}
          />
        ) : (
          <>
            {erro ? (
              <Alerta
                severity={severidadeDoErro(erroVariante)}
                role={severidadeDoErro(erroVariante) === "warning" ? "status" : "alert"}
                titulo={
                  erroVariante === "offline" ? "Sem conexão" : "Não foi possível carregar o dia"
                }
              >
                {erro}
              </Alerta>
            ) : null}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Cartao role="group" aria-label="Resumo do dia" aria-busy={carregandoPainel}>
                  <CartaoCabecalho>
                    <CartaoTitulo>Infrequência</CartaoTitulo>
                    {!feriado && !carregandoPainel && resumo.parciais > 0 ? (
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {resumo.parciais}{" "}
                        {resumo.parciais === 1 ? "presença parcial" : "presenças parciais"}
                      </Typography>
                    ) : null}
                  </CartaoCabecalho>
                  <CartaoConteudo>
                    {feriado ? (
                      <IndicadorFeriado nome={feriado.nome} />
                    ) : (
                      (() => {
                        const nivel =
                          resumo.registrados > 0
                            ? nivelInfrequencia(
                                resumo.infrequencia,
                                limiaresDoPainel(configuracoes),
                              )
                            : null;
                        const config = nivel ? NIVEIS[nivel] : null;
                        const Icone = config?.Icone;
                        const largura = Math.min(100, Math.max(0, resumo.infrequencia * 100));
                        const texto = config
                          ? `${percentual.format(resumo.infrequencia)} de infrequência, ${config.rotulo.toLowerCase()}`
                          : "Sem dados";
                        return (
                          <Stack spacing={1}>
                            <Typography
                              variant={config ? "h4" : "body2"}
                              sx={{
                                fontWeight: config ? 600 : 400,
                                fontVariantNumeric: "tabular-nums",
                                fontSize: config ? { xs: "1.875rem", sm: "2.25rem" } : undefined,
                                color: config ? "text.primary" : "text.secondary",
                              }}
                            >
                              {config ? percentual.format(resumo.infrequencia) : "Sem dados"}
                            </Typography>
                            <BarraProgresso
                              valor={largura}
                              tom={config?.tom ?? "neutro"}
                              rotulo="Infrequência do dia"
                              descricao={texto}
                              testId="infrequencia-preenchida"
                            />
                            {config && Icone ? (
                              <Stack
                                direction="row"
                                spacing={0.75}
                                sx={{ alignItems: "center", color: config.cor }}
                              >
                                <Icone aria-hidden="true" sx={{ fontSize: 16, flexShrink: 0 }} />
                                <Typography variant="caption" sx={{ color: "inherit" }}>
                                  {config.rotulo}
                                </Typography>
                              </Stack>
                            ) : null}
                          </Stack>
                        );
                      })()
                    )}
                  </CartaoConteudo>
                </Cartao>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <IndicadorCobertura turmas={coberturaTurmas} feriado={feriado?.nome} />
              </Grid>
            </Grid>

            <FaixaGraficos
              valor={cartaoAtivo}
              onValor={setCartaoAtivo}
              ocupado={atualizando}
              itens={[
                {
                  id: "escola",
                  rotulo: "Toda a escola",
                  render: () => graficoDoDia(null),
                },
                ...series.map((serie) => ({
                  id: serie.id,
                  rotulo: serie.nome,
                  render: () => graficoDoDia(serie),
                })),
                {
                  id: "personalizado",
                  rotulo: "Personalizado",
                  render: () => (
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
                  rotulo: "Desistentes",
                  render: () => (
                    <Cartao>
                      <CartaoCabecalho>
                        <CartaoTitulo>Desistentes até este dia</CartaoTitulo>
                        <Typography
                          variant="body2"
                          sx={{
                            color: "text.secondary",
                            fontVariantNumeric: "tabular-nums",
                            flexShrink: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {desistencias.total} {desistencias.total === 1 ? "aluno" : "alunos"}
                        </Typography>
                      </CartaoCabecalho>
                      <CartaoConteudo>
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
                      </CartaoConteudo>
                    </Cartao>
                  ),
                },
              ]}
            />
          </>
        )}
      </Stack>
    </Box>
  );
}
