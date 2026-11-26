"use client";

// Saiu mais cedo: registro da saída antecipada e lista das saídas do dia, com
// remoção para corrigir um registro. A lista abre bloqueada, sem o botão de
// remover, e só o botão Desbloquear a libera. Separado da chamada. O relatório
// por aluno fica em Relatórios, Saídas e entradas.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import type {
  Aluno,
  JustificativaConfigurada,
  LiberadorConfigurado,
  SaidaAntecipada,
  Turma,
} from "@/domain/frequencia";
import {
  ehMomentoDeAula,
  dataNoFuso,
  horaNoFuso,
  JUSTIFICATIVA_OUTROS,
  MOMENTOS_SAIDA,
  partesJustificativaSaida,
  rotuloData,
  rotuloDiaSemana,
  rotuloMomento,
} from "@/domain/frequencia";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";

import { FormularioPadrao } from "@/components/layout/formulario-padrao";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { CamposMovimentacao } from "@/components/movimentacoes/campos-movimentacao";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { VistaResumoMovimentacoes } from "@/components/movimentacoes/resumo-semana-movimentacoes";
import { DialogoConfirmarMovimentacao } from "@/components/movimentacoes/dialogo-confirmar-movimentacao";
import { HistoricoDiarioMovimentacoes } from "@/components/movimentacoes/historico-diario-movimentacoes";
import {
  useHistoricoDiario,
  type LeituraMensalSaidas,
} from "@/components/movimentacoes/use-historico-movimentacoes";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { useMinutoCorrente } from "@/lib/use-relogio";

interface Props {
  diaCorrente: string;
  fuso: string;
  mes: string;
  turmas: Turma[];
  alunos: Aluno[];
  catalogoJustificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  saidas: SaidaAntecipada[];
  leituraMensal: LeituraMensalSaidas;
  onSaidasMudaram: (mes: string) => Promise<void>;
  /** Usado pela área de movimentações; esta vista não precisa dele. */
  ativo?: boolean;
  /** Incrementado pelo botão global para reler o dia. */
  atualizacao?: number;
  /** Informa o mês do dia visível para o envio da planilha. */
  onMesVisivel?: (mes: string) => void;
}

type FormaJustificativa = "texto" | "catalogo";

const ESTILO_LEITOR = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const ESTILO_NAVEGACAO = {
  width: 44,
  height: "auto",
  minHeight: 44,
  flexShrink: 0,
} as const;

function IndicadorCarregando({ texto }: { texto: string }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      role="status"
      sx={{ alignItems: "center", color: "text.secondary" }}
    >
      <CircularProgress size={16} aria-hidden="true" />
      <Typography variant="body2">{texto}</Typography>
    </Stack>
  );
}

async function lerSaidas(url: string) {
  const { saidas } = await pedir<{ saidas: SaidaAntecipada[] }>(url);
  return saidas;
}

export default function VistaSaidas({
  diaCorrente,
  fuso,
  mes,
  turmas,
  alunos,
  catalogoJustificativas,
  liberadores,
  saidas,
  leituraMensal,
  onSaidasMudaram,
  ativo = true,
  atualizacao = 0,
  onMesVisivel,
}: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const nav = useNavegacaoDoDia({
    diaCorrente,
    max: diaCorrente,
    domingoComoResumo: true,
  });
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const dia = nav.dia;
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [momento, setMomento] = useState("");
  const [horario, setHorario] = useState("");
  const minuto = useMinutoCorrente();
  const horarioInicial =
    minuto === null ? "" : horaNoFuso(new Date(minuto * 60_000).toISOString(), fuso);
  const horarioEfetivo = horario || horarioInicial;
  const [formaJustificativa, setFormaJustificativa] = useState<FormaJustificativa>("catalogo");
  const [justificativa, setJustificativa] = useState("");
  const [texto, setTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [responsavelCodigo, setResponsavelCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const confirmacaoHistoricaRef = useRef<{ confirmar: boolean; motivo: string }>({
    confirmar: false,
    motivo: "",
  });
  const [confirmacaoHistoricaAberta, setConfirmacaoHistoricaAberta] = useState(false);
  const [motivoHistorico, setMotivoHistorico] = useState("");
  const [erroHistorico, setErroHistorico] = useState("");
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [recarregarDia, setRecarregarDia] = useState(0);
  const [saidaRemover, setSaidaRemover] = useState<SaidaAntecipada | null>(null);
  const [verDomingo, setVerDomingo] = useState(false);
  const [registrosDomingo, setRegistrosDomingo] = useState<SaidaAntecipada[]>([]);
  const [carregandoDomingo, setCarregandoDomingo] = useState(false);

  const diaReferencia = nav.resumo ? (nav.domingo ?? dia) : dia;
  useEffect(() => {
    onMesVisivel?.(diaReferencia.slice(0, 7));
  }, [diaReferencia, onMesVisivel]);
  // Dia cuja lista foi desbloqueada: trocar de dia volta a bloquear.
  const [diaLiberado, setDiaLiberado] = useState<string | null>(null);

  const { chaveAtiva: removendoId, executar: executarRemocao } = useAcoesPorChave();

  const rotuloTurma = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Sem turma";
  }, [turmas]);

  const opcoesJustificativa = useMemo(
    () =>
      catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: `${item.codigo} · ${item.rotulo}` })),
    [catalogoJustificativas],
  );

  const opcoesLiberador = useMemo(
    () =>
      liberadores
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: item.rotulo })),
    [liberadores],
  );

  const alunosPorId = useMemo(() => new Map(alunos.map((aluno) => [aluno.id, aluno])), [alunos]);

  const ehDoMes = dia.startsWith(mes);
  // Uma nova tentativa após falha mensal consulta só o dia, sem trocar o cache dos relatórios.
  const recorteMensal = useMemo(() => ({ dia, leituraMensal }), [dia, leituraMensal]);
  const [tentarDia, setTentarDia] = useState<typeof recorteMensal | null>(null);
  const compartilhado = ehDoMes && leituraMensal.mes === mes && tentarDia !== recorteMensal;
  const { leitura: leituraDiaria, reler } = useHistoricoDiario(
    nav.resumo || compartilhado ? null : `/api/saidas?dia=${dia}`,
    lerSaidas,
    atualizacao + recarregarDia,
    "Não foi possível carregar as saídas.",
  );
  const leitura = compartilhado ? leituraMensal : leituraDiaria;
  useLeituraDaVisao(ativo && !nav.resumo && leitura.estado === "carregando");
  const duranteAula = ehMomentoDeAula(momento);
  const listaBloqueada = diaLiberado !== dia;
  const domingoBloqueado = diaLiberado !== nav.domingo;

  function tentarNovamente() {
    if (compartilhado) setTentarDia(recorteMensal);
    else reler();
  }

  useEffect(() => {
    if (!verDomingo || !nav.domingo) return;
    let viva = true;
    pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?dia=${nav.domingo}`)
      .then((dados) => {
        if (viva) setRegistrosDomingo(dados.saidas);
      })
      .catch(() => {
        if (viva) setRegistrosDomingo([]);
      })
      .finally(() => {
        if (viva) setCarregandoDomingo(false);
      });
    return () => {
      viva = false;
    };
  }, [verDomingo, nav.domingo, recarregarDia, atualizacao]);

  const saidasDoDia = useMemo(() => {
    if (compartilhado) {
      return leituraMensal.estado === "pronto" ? saidas.filter((saida) => saida.dia === dia) : [];
    }
    return leituraDiaria.estado === "pronto" ? leituraDiaria.registros : [];
  }, [compartilhado, dia, saidas, leituraMensal, leituraDiaria]);

  const opcoesTurma = useMemo(() => {
    const comAlunos = new Set(alunos.filter((aluno) => aluno.ativo).map((aluno) => aluno.turmaId));
    return [
      { valor: "todas", rotulo: "Todas as turmas" },
      ...turmas
        .filter((turma) => comAlunos.has(turma.id))
        .map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    ];
  }, [alunos, turmas]);

  const alunosFiltrados = useMemo(() => {
    return alunos
      .filter((aluno) => aluno.ativo)
      .filter((aluno) => (turmaFiltro ? aluno.turmaId === turmaFiltro : true))
      .sort(
        (a, b) =>
          rotuloTurma(a.turmaId).localeCompare(rotuloTurma(b.turmaId), "pt-BR") ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [alunos, turmaFiltro, rotuloTurma]);
  const opcoesAluno = useMemo(
    () =>
      alunosFiltrados.map((aluno) => ({
        valor: aluno.id,
        rotulo: `${aluno.nome} · ${rotuloTurma(aluno.turmaId)}`,
      })),
    [alunosFiltrados, rotuloTurma],
  );

  function partesDaSaida(saida: SaidaAntecipada, turma: string): string[] {
    const partes = partesJustificativaSaida(saida, catalogoJustificativas);
    return [
      turma,
      saida.horario ?? "",
      rotuloMomento(saida.momento),
      partes.motivo,
      partes.complemento ?? "",
    ].filter(Boolean);
  }

  function validarRegistro(): boolean {
    if (!alunoId || !momento || !responsavelCodigo) {
      setErro("Escolha o aluno, o momento da saída e quem liberou.");
      return false;
    }
    if (formaJustificativa === "catalogo" && !justificativa) {
      setErro("Escolha o tipo de justificativa.");
      return false;
    }
    if (formaJustificativa === "texto" && texto.trim() === "") {
      setErro("Escreva a justificativa em poucas palavras.");
      return false;
    }
    return true;
  }

  function abrirConfirmacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    if (!validarRegistro()) return;
    setConfirmacaoAberta(true);
  }

  async function registrar() {
    if (enviando) return;
    if (!validarRegistro()) {
      setConfirmacaoAberta(false);
      return;
    }
    setConfirmacaoAberta(false);
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ saida: SaidaAntecipada }>(
        "/api/saidas",
        corpoJson({
          alunoId,
          dia,
          momento,
          horario: horarioEfetivo,
          justificativa: formaJustificativa === "catalogo" ? justificativa : undefined,
          texto:
            formaJustificativa === "texto"
              ? texto.trim()
              : duranteAula && texto.trim() !== ""
                ? texto.trim()
                : undefined,
          observacao:
            formaJustificativa === "catalogo" &&
            !duranteAula &&
            justificativa === JUSTIFICATIVA_OUTROS &&
            observacao.trim() !== ""
              ? observacao
              : undefined,
          liberadoPorCodigo: responsavelCodigo,
          ...(confirmacaoHistoricaRef.current.confirmar
            ? {
                confirmarHistorico: true,
                motivo: confirmacaoHistoricaRef.current.motivo,
              }
            : {}),
        }),
      );
      avisarSucesso(
        "Saída registrada.",
        "O registro aparece em Saídas, no dia de hoje, e nos relatórios.",
      );
      setAlunoId("");
      setMomento("");
      setFormaJustificativa("catalogo");
      setJustificativa("");
      setTexto("");
      setObservacao("");
      setResponsavelCodigo("");
      confirmacaoHistoricaRef.current = { confirmar: false, motivo: "" };
      setMotivoHistorico("");
      setErroHistorico("");
      if (ehDoMes) {
        await onSaidasMudaram(dia.slice(0, 7));
      } else {
        setRecarregarDia((valor) => valor + 1);
      }
    } catch (excecao) {
      const falha = excecao instanceof ErroApi ? excecao : null;
      const precisaConfirmar =
        (falha?.corpo as { codigo?: string } | undefined)?.codigo ===
        "CONFIRMACAO_HISTORICA_NECESSARIA";
      if (precisaConfirmar && !confirmacaoHistoricaRef.current.confirmar) {
        setConfirmacaoHistoricaAberta(true);
        setErroHistorico("");
        setErro("");
        setErroVariante("indisponivel");
        return;
      }
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível registrar a saída.";
      setErro(mensagem);
      setErroVariante(estadoDeErro(excecao));
      if (!(excecao instanceof ErroApi && excecao.status === 401)) {
        avisarErro(excecao, { contexto: "Não foi possível registrar a saída." });
      }
    } finally {
      setEnviando(false);
    }
  }

  function remover(saida: SaidaAntecipada) {
    setSaidaRemover(saida);
  }

  function confirmarRemocao() {
    if (!saidaRemover) return;
    const saida = saidaRemover;
    setSaidaRemover(null);
    void executarRemocao(saida.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/saidas/${saida.id}`, { method: "DELETE" });
        avisarSucesso("Saída removida.");
        if (ehDoMes) {
          await onSaidasMudaram(dia.slice(0, 7));
        } else {
          setRecarregarDia((valor) => valor + 1);
        }
      } catch (excecao) {
        if (!(excecao instanceof ErroApi && excecao.status === 401)) {
          avisarErro(excecao, { contexto: "Não foi possível remover a saída." });
        }
      }
    });
  }

  function confirmarSaidaHistorica() {
    const motivo = motivoHistorico.trim();
    if (motivo.length < 3 || motivo.length > 200) {
      setErroHistorico(
        motivo.length < 3
          ? "Informe um motivo com pelo menos 3 caracteres."
          : "O motivo deve ter no máximo 200 caracteres.",
      );
      return;
    }
    confirmacaoHistoricaRef.current = { confirmar: true, motivo };
    setConfirmacaoHistoricaAberta(false);
    setErroHistorico("");
    void registrar();
  }

  function cancelarSaidaHistorica() {
    confirmacaoHistoricaRef.current = { confirmar: false, motivo: "" };
    setMotivoHistorico("");
    setErroHistorico("");
    setConfirmacaoHistoricaAberta(false);
  }

  const rotuloDia = dia.split("-").reverse().join("/");
  const alunoConfirmacao = alunosPorId.get(alunoId);
  const turmaConfirmacao = alunoConfirmacao ? rotuloTurma(alunoConfirmacao.turmaId) : "";
  const justificativaConfirmacao =
    formaJustificativa === "catalogo"
      ? [
          catalogoJustificativas.find((item) => item.codigo === justificativa)?.rotulo ??
            justificativa,
          duranteAula ? texto.trim() : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : texto.trim();
  const responsavelConfirmacao =
    liberadores.find((item) => item.codigo === responsavelCodigo)?.rotulo ?? "";

  return (
    <Box
      component="section"
      aria-label="Saídas antecipadas"
      sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, sm: 2 }, pb: 3 }}
    >
      <Typography component="h1" sx={ESTILO_LEITOR}>
        Saiu mais cedo
      </Typography>

      <Stack spacing={1} useFlexGap>
        <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
          <BotaoIcone
            rotulo="Dia anterior"
            variante="contorno"
            icone={<ChevronLeftRoundedIcon />}
            sx={ESTILO_NAVEGACAO}
            onClick={() => {
              setVerDomingo(false);
              nav.anterior();
            }}
          />
          <Box sx={{ minWidth: 0, flex: 1, display: "flex", "& > button": { flex: 1 } }}>
            <SeletorPeriodo
              id="dia-saidas"
              modo="dia"
              valor={nav.resumo ? (nav.domingo ?? "") : dia}
              max={diaCorrente}
              calendarioSemanal
              mostrarSelo={!nav.resumo}
              rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da saída"}
              rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : rotuloDia}
              detalhe={nav.resumo ? "semana" : rotuloDiaSemana(dia).replace("-feira", "")}
              onAbertoChange={setCalendarioAberto}
              onValor={(proximo) => {
                setVerDomingo(false);
                nav.escolherDia(proximo);
              }}
            />
          </Box>
          <BotaoIcone
            rotulo="Dia seguinte"
            variante="contorno"
            icone={<ChevronRightRoundedIcon />}
            sx={ESTILO_NAVEGACAO}
            disabled={nav.seguinteDesabilitado}
            onClick={() => {
              setVerDomingo(false);
              nav.seguinte();
            }}
          />
        </Stack>
        {!nav.resumo && (
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <AtualizadoDaVisao fuso={fuso} sx={{ whiteSpace: "normal" }} />
          </Box>
        )}
      </Stack>

      {nav.resumo && nav.semana ? (
        <VistaResumoMovimentacoes
          tipo="saida"
          turmas={turmas}
          alunos={alunos}
          dias={nav.semana}
          domingo={nav.domingo}
          versao={atualizacao}
          ativo={ativo}
          pausado={calendarioAberto}
          fuso={fuso}
          onAbrirDia={(proximo) => {
            setTurmaFiltro("");
            setAlunoId("");
            setVerDomingo(false);
            nav.escolherDia(proximo);
          }}
          onVerDomingo={() => {
            setTurmaFiltro("");
            setAlunoId("");
            setDiaLiberado(null);
            setCarregandoDomingo(true);
            setVerDomingo(true);
          }}
        />
      ) : null}

      {nav.resumo && verDomingo && nav.domingo ? (
        <Paper
          component="section"
          variant="outlined"
          aria-label="Registros do domingo"
          sx={{ p: 2, boxShadow: "none" }}
        >
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{
                alignItems: { xs: "stretch", sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
                Saídas de {rotuloData(nav.domingo)}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Botao
                  variante="contorno"
                  icone={domingoBloqueado ? <LockOpenRoundedIcon /> : <LockRoundedIcon />}
                  aria-label={`${domingoBloqueado ? "Desbloquear" : "Bloquear"} remoção das saídas de ${rotuloData(nav.domingo)}`}
                  disabled={removendoId !== null}
                  onClick={() => setDiaLiberado(domingoBloqueado ? nav.domingo : null)}
                >
                  {domingoBloqueado ? "Desbloquear" : "Bloquear"}
                </Botao>
                <Botao variante="texto" onClick={() => setVerDomingo(false)}>
                  Voltar ao resumo
                </Botao>
              </Stack>
            </Stack>
            {carregandoDomingo ? (
              <IndicadorCarregando texto="Carregando saídas..." />
            ) : registrosDomingo.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Nenhuma saída registrada neste domingo.
              </Typography>
            ) : (
              <List aria-label={`Saídas de ${rotuloData(nav.domingo)}`} disablePadding>
                {registrosDomingo.map((saida) => {
                  const aluno = alunosPorId.get(saida.alunoId);
                  const nome = aluno?.nome ?? "Aluno";
                  return (
                    <ListItem
                      key={saida.id}
                      divider
                      sx={{ alignItems: "flex-start", gap: 2, px: 0 }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                        >
                          {nome}
                        </Typography>
                        <CaixasDeInfo
                          itens={partesDaSaida(
                            saida,
                            saida.turmaHistoricaNome ?? "Turma histórica desconhecida",
                          )}
                          sx={{ mt: 1 }}
                        />
                      </Box>
                      {!domingoBloqueado && (
                        <BotaoIcone
                          rotulo={`Remover saída de ${nome}`}
                          variante="texto"
                          icone={<DeleteOutlineRoundedIcon />}
                          sx={{ color: "falta.texto" }}
                          disabled={removendoId === saida.id}
                          onClick={() => setSaidaRemover(saida)}
                        />
                      )}
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Stack>
        </Paper>
      ) : null}

      {!nav.resumo && (
        <>
          <Paper
            component="form"
            variant="outlined"
            onSubmit={abrirConfirmacao}
            noValidate
            sx={{ p: 2, boxShadow: "none" }}
          >
            <Stack spacing={1} useFlexGap>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
                Registrar saída
              </Typography>
              <FormularioPadrao
                colunas={1}
                acoes={
                  <Botao
                    type="submit"
                    variante="secundario"
                    carregando={enviando}
                    disabled={opcoesLiberador.length === 0}
                    sx={{ width: { xs: "100%", sm: "auto" } }}
                  >
                    Registrar saída
                  </Botao>
                }
              >
                <Stack spacing={1} useFlexGap>
                  <CamposMovimentacao
                    tipo="saida"
                    turma={turmaFiltro}
                    alunoId={alunoId}
                    momento={momento}
                    horario={horarioEfetivo}
                    responsavel={responsavelCodigo}
                    forma={formaJustificativa}
                    texto={texto}
                    justificativa={justificativa}
                    observacao={observacao}
                    opcoesTurma={opcoesTurma}
                    opcoesAluno={opcoesAluno}
                    opcoesMomento={MOMENTOS_SAIDA.map((item) => ({
                      valor: item.codigo,
                      rotulo: item.rotulo,
                    }))}
                    opcoesJustificativa={opcoesJustificativa}
                    opcoesResponsavel={opcoesLiberador}
                    fuso={fuso}
                    enviando={enviando}
                    mostrarTextoCatalogo={duranteAula}
                    mostrarObservacao={!duranteAula && justificativa === JUSTIFICATIVA_OUTROS}
                    catalogoEmDuasColunas
                    descricaoResponsavel={
                      opcoesLiberador.length === 0
                        ? "Nenhum responsável cadastrado. Cadastre em Gestão, Configurações."
                        : undefined
                    }
                    onTurma={(valor) => {
                      setTurmaFiltro(valor);
                      setAlunoId("");
                    }}
                    onAluno={setAlunoId}
                    onMomento={setMomento}
                    onHorario={setHorario}
                    onResponsavel={setResponsavelCodigo}
                    onForma={(valor) => {
                      setFormaJustificativa(valor);
                      if (valor === "texto") {
                        setJustificativa("");
                        setObservacao("");
                        return;
                      }
                      setTexto("");
                    }}
                    onTexto={setTexto}
                    onJustificativa={setJustificativa}
                    onObservacao={setObservacao}
                  />
                  {erro && (
                    <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
                  )}
                </Stack>
              </FormularioPadrao>
            </Stack>
          </Paper>

          <HistoricoDiarioMovimentacoes
            titulo={`Saídas de ${rotuloDia}`}
            carregando={leitura.estado === "carregando"}
            falha={leitura.estado === "falha" ? leitura.falha : undefined}
            onTentarNovamente={tentarNovamente}
            textoCarregando="Carregando saídas..."
            textoVazio="Nenhuma saída registrada neste dia."
            acao={
              <Botao
                variante="contorno"
                icone={listaBloqueada ? <LockOpenRoundedIcon /> : <LockRoundedIcon />}
                aria-label={`${listaBloqueada ? "Desbloquear" : "Bloquear"} remoção das saídas de ${rotuloDia}`}
                disabled={removendoId !== null}
                onClick={() => setDiaLiberado(listaBloqueada ? dia : null)}
              >
                {listaBloqueada ? "Desbloquear" : "Bloquear"}
              </Botao>
            }
            registros={saidasDoDia.map((saida) => {
              const nome = alunosPorId.get(saida.alunoId)?.nome ?? "Aluno";
              const dataRegistro = dataNoFuso(saida.criadoEm, fuso);
              const horaRegistro = horaNoFuso(saida.criadoEm, fuso);
              return {
                id: saida.id,
                nome,
                itens: partesDaSaida(
                  saida,
                  saida.turmaHistoricaNome ?? "Turma histórica desconhecida",
                ),
                rodape: `Liberado por ${saida.liberadoPorNome ?? "registro anterior"}${dataRegistro && horaRegistro ? ` em ${dataRegistro} às ${horaRegistro}` : ""}`,
                acao: !listaBloqueada && (
                  <BotaoIcone
                    rotulo={`Remover saída de ${nome}`}
                    variante="texto"
                    icone={<DeleteOutlineRoundedIcon />}
                    sx={{ color: "falta.texto" }}
                    disabled={removendoId === saida.id}
                    onClick={() => remover(saida)}
                  />
                ),
              };
            })}
          />
        </>
      )}
      <DialogoConfirmarMovimentacao
        aberto={confirmacaoAberta}
        onAbrir={setConfirmacaoAberta}
        titulo="Registrar saída?"
        descricao="Confira os dados antes de registrar. Depois de salvo, o lançamento aparece na lista do dia e nos relatórios."
        rotuloConfirmar="Registrar saída"
        onConfirmar={() => void registrar()}
        itens={[
          { rotulo: "Aluno", valor: alunoConfirmacao?.nome ?? "" },
          { rotulo: "Turma", valor: turmaConfirmacao },
          { rotulo: "Dia", valor: rotuloDia },
          { rotulo: "Momento", valor: momento ? rotuloMomento(momento) : "" },
          { rotulo: "Horário", valor: horarioEfetivo },
          { rotulo: "Justificativa", valor: justificativaConfirmacao },
          {
            rotulo: "Observação",
            valor:
              formaJustificativa === "catalogo" &&
              justificativa === JUSTIFICATIVA_OUTROS &&
              !duranteAula
                ? observacao.trim()
                : "",
          },
          { rotulo: "Responsável", valor: responsavelConfirmacao },
        ]}
      />
      <DialogoConfirmacao
        aberto={saidaRemover !== null}
        titulo="Remover esta saída?"
        descricao={`A saída de ${
          alunosPorId.get(saidaRemover?.alunoId ?? "")?.nome ?? "aluno"
        } em ${saidaRemover?.dia.split("-").reverse().join("/") ?? ""} sai da lista do dia e dos relatórios.`}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setSaidaRemover(null)}
        rotuloConfirmar="Remover"
        destrutivo
        operacaoEmAndamento={saidaRemover !== null && removendoId === saidaRemover.id}
      />

      <DialogoConfirmacao
        aberto={confirmacaoHistoricaAberta}
        titulo="Confirmar saída histórica?"
        descricao={
          <Stack spacing={2}>
            <Typography component="p" variant="body2">
              A referência da turma e das aulas nesta data não pôde ser comprovada. Confirme o
              lançamento e informe o motivo. A confirmação fica registrada na auditoria.
            </Typography>
            <Campo id="motivo-saida-historica" rotulo="Motivo">
              <CampoTexto
                id="motivo-saida-historica"
                valor={motivoHistorico}
                onValor={setMotivoHistorico}
                maxLength={200}
                placeholder="Ex.: saída do diário de papel"
              />
            </Campo>
            {erroHistorico ? (
              <Typography role="alert" variant="body2" sx={{ color: "falta.texto" }}>
                {erroHistorico}
              </Typography>
            ) : null}
          </Stack>
        }
        onConfirmar={confirmarSaidaHistorica}
        onCancelar={cancelarSaidaHistorica}
        rotuloConfirmar="Confirmar e registrar"
        operacaoEmAndamento={enviando}
      />
    </Box>
  );
}
