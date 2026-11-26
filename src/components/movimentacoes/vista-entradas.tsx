"use client";

// Registro e consulta de chegadas atrasadas com envio revisado para aba própria.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import type {
  Aluno,
  Turma,
  LiberadorConfigurado,
  JustificativaConfigurada,
} from "@/domain/frequencia";
import {
  horaNoFuso,
  rotuloData,
  rotuloDiaSemana,
  MOMENTOS_SAIDA,
  partesDoMotivo,
  rotuloMomento,
} from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { useAvisosDaSessao } from "@/lib/avisos";

import { FormularioPadrao } from "@/components/layout/formulario-padrao";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { CamposMovimentacao } from "@/components/movimentacoes/campos-movimentacao";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { VistaResumoMovimentacoes } from "@/components/movimentacoes/resumo-semana-movimentacoes";
import { DialogoConfirmarMovimentacao } from "@/components/movimentacoes/dialogo-confirmar-movimentacao";
import { HistoricoDiarioMovimentacoes } from "@/components/movimentacoes/historico-diario-movimentacoes";
import { useHistoricoDiario } from "@/components/movimentacoes/use-historico-movimentacoes";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { useMinutoCorrente } from "@/lib/use-relogio";

interface Props {
  diaCorrente: string;
  fuso: string;
  turmas: Turma[];
  alunos: Aluno[];
  liberadores: LiberadorConfigurado[];
  catalogoJustificativas: JustificativaConfigurada[];
  ativo?: boolean;
  atualizacao?: number;
}
const OPCOES_MOMENTO = MOMENTOS_SAIDA.map((item) => ({ valor: item.codigo, rotulo: item.rotulo }));

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

async function lerEntradas(url: string) {
  const { entradas } = await pedir<{ entradas: EntradaAtrasada[] }>(url);
  return entradas;
}

export default function VistaEntradas({
  diaCorrente,
  fuso,
  turmas,
  alunos,
  liberadores,
  catalogoJustificativas,
  ativo = true,
  atualizacao = 0,
}: Props) {
  const { avisarSucesso } = useAvisosDaSessao();
  const nav = useNavegacaoDoDia({
    diaCorrente,
    max: diaCorrente,
    domingoComoResumo: true,
  });
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const dia = nav.dia;
  const [turma, setTurma] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [horario, setHorario] = useState("");
  const minuto = useMinutoCorrente();
  const horarioInicial =
    minuto === null ? "" : horaNoFuso(new Date(minuto * 60_000).toISOString(), fuso);
  const horarioEfetivo = horario || horarioInicial;
  const [motivo, setMotivo] = useState("");
  const [momento, setMomento] = useState("");
  const [responsavelCodigo, setResponsavelCodigo] = useState("");
  const [formaJustificativa, setFormaJustificativa] = useState<"catalogo" | "texto">("catalogo");
  const [justificativa, setJustificativa] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const [remover, setRemover] = useState<EntradaAtrasada | null>(null);
  const [verDomingo, setVerDomingo] = useState(false);
  const [entradasDomingo, setEntradasDomingo] = useState<EntradaAtrasada[]>([]);
  const [carregandoDomingo, setCarregandoDomingo] = useState(false);
  const { leitura, reler } = useHistoricoDiario(
    nav.resumo ? null : `/api/entradas?de=${dia}&ate=${dia}${turma ? `&turmaId=${turma}` : ""}`,
    lerEntradas,
    atualizacao + versao,
    "Não foi possível carregar as entradas.",
  );
  const carregando = leitura.estado === "carregando";
  useLeituraDaVisao(ativo && !nav.resumo && carregando);
  const entradas = leitura.estado === "pronto" ? leitura.registros : [];

  useEffect(() => {
    if (!verDomingo || !nav.domingo) return;
    let viva = true;
    pedir<{ entradas: EntradaAtrasada[] }>(`/api/entradas?de=${nav.domingo}&ate=${nav.domingo}`)
      .then((dados) => {
        if (viva) setEntradasDomingo(dados.entradas);
      })
      .catch(() => {
        if (viva) setEntradasDomingo([]);
      })
      .finally(() => {
        if (viva) setCarregandoDomingo(false);
      });
    return () => {
      viva = false;
    };
  }, [verDomingo, nav.domingo, versao, atualizacao]);

  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const executando = chaveAtiva !== null;
  const executar = (acao: () => Promise<void>) =>
    executarPorChave("entrada", async () => {
      setErro("");
      try {
        await acao();
      } catch (erro) {
        setRemover(null);
        setErro(
          erro instanceof ErroApi
            ? erro.message
            : "Não foi possível concluir a operação. Tente novamente.",
        );
      }
    });
  const opcoesResponsavel = useMemo(
    () =>
      liberadores
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: item.rotulo })),
    [liberadores],
  );
  const opcoesJustificativa = useMemo(
    () =>
      catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({
          valor: item.codigo,
          rotulo: `${item.codigo} · ${item.rotulo}`,
        })),
    [catalogoJustificativas],
  );
  const turmasPorId = useMemo(
    () => new Map(turmas.map((item) => [item.id, item.rotulo])),
    [turmas],
  );
  const opcoesTurma = useMemo(() => {
    const comAlunos = new Set(alunos.filter((aluno) => aluno.ativo).map((aluno) => aluno.turmaId));
    return [
      { valor: "todas", rotulo: "Todas as turmas" },
      ...turmas
        .filter((item) => comAlunos.has(item.id))
        .map((item) => ({ valor: item.id, rotulo: item.rotulo })),
    ];
  }, [alunos, turmas]);
  const opcoesAluno = useMemo(
    () =>
      alunos
        .filter(
          (item) =>
            item.ativo &&
            (!item.desistenteEm || item.desistenteEm > dia) &&
            (!turma || item.turmaId === turma),
        )
        .map((item) => ({
          valor: item.id,
          rotulo: `${item.nome} · ${turmasPorId.get(item.turmaId) ?? ""}`,
        })),
    [alunos, dia, turma, turmasPorId],
  );
  function escolherDia(valor: string) {
    setErro("");
    nav.escolherDia(valor);
  }

  function validarEntrada(): boolean {
    if (!alunoId || !momento || !responsavelCodigo) {
      setErro("Escolha o aluno, o momento da entrada e o responsável.");
      return false;
    }
    if (formaJustificativa === "texto" && motivo.trim().length < 2) {
      setErro("Escreva a justificativa em poucas palavras.");
      return false;
    }
    if (formaJustificativa === "catalogo" && !justificativa) {
      setErro("Escolha o tipo de justificativa.");
      return false;
    }
    return true;
  }

  function abrirConfirmacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (executando) return;
    if (!validarEntrada()) return;
    setConfirmacaoAberta(true);
  }

  async function registrarEntrada() {
    if (executando) return;
    if (!validarEntrada()) {
      setConfirmacaoAberta(false);
      return;
    }
    setConfirmacaoAberta(false);
    await executar(async () => {
      await pedir("/api/entradas", {
        method: "POST",
        ...corpoJson({
          alunoId,
          dia,
          horario: horarioEfetivo,
          momento,
          responsavelRegistroCodigo: responsavelCodigo,
          ...(formaJustificativa === "texto"
            ? { motivo }
            : { justificativa, observacao: observacao || undefined }),
        }),
      });
      setAlunoId("");
      setMotivo("");
      setMomento("");
      setResponsavelCodigo("");
      setJustificativa("");
      setObservacao("");
      setFormaJustificativa("catalogo");
      setVersao((valor) => valor + 1);
      avisarSucesso("Entrada registrada.");
    });
  }

  const alunoConfirmacao = alunos.find((item) => item.id === alunoId);
  const justificativaConfirmacao =
    formaJustificativa === "texto"
      ? motivo.trim()
      : (catalogoJustificativas.find((item) => item.codigo === justificativa)?.rotulo ??
        justificativa);
  const responsavelConfirmacao =
    liberadores.find((item) => item.codigo === responsavelCodigo)?.rotulo ?? "";

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, sm: 2 }, pb: 3 }}
      component="section"
      aria-label="Entradas atrasadas"
    >
      <Typography component="h1" sx={ESTILO_LEITOR}>
        Entradas atrasadas
      </Typography>
      <Stack spacing={1} useFlexGap>
        <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
          <BotaoIcone
            rotulo="Dia anterior"
            variante="contorno"
            icone={<ChevronLeftRoundedIcon />}
            sx={ESTILO_NAVEGACAO}
            disabled={executando}
            onClick={() => {
              setVerDomingo(false);
              nav.anterior();
            }}
          />
          <Box sx={{ minWidth: 0, flex: 1, display: "flex", "& > button": { flex: 1 } }}>
            <SeletorPeriodo
              id="entrada-dia"
              modo="dia"
              valor={nav.resumo ? (nav.domingo ?? "") : dia}
              max={diaCorrente}
              calendarioSemanal
              mostrarSelo={!nav.resumo}
              rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da entrada"}
              rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : dia.split("-").reverse().join("/")}
              detalhe={nav.resumo ? "semana" : rotuloDiaSemana(dia).replace("-feira", "")}
              disabled={executando}
              onAbertoChange={setCalendarioAberto}
              onValor={(proximo) => {
                setVerDomingo(false);
                escolherDia(proximo);
              }}
            />
          </Box>
          <BotaoIcone
            rotulo="Dia seguinte"
            variante="contorno"
            icone={<ChevronRightRoundedIcon />}
            sx={ESTILO_NAVEGACAO}
            disabled={executando || nav.seguinteDesabilitado}
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
          tipo="entrada"
          turmas={turmas}
          alunos={alunos}
          dias={nav.semana}
          domingo={nav.domingo}
          versao={atualizacao}
          ativo={ativo}
          pausado={calendarioAberto}
          fuso={fuso}
          onAbrirDia={(proximo) => {
            setTurma("");
            setAlunoId("");
            setVerDomingo(false);
            nav.escolherDia(proximo);
          }}
          onVerDomingo={() => {
            setTurma("");
            setAlunoId("");
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
                Entradas de {rotuloData(nav.domingo)}
              </Typography>
              <Botao variante="texto" onClick={() => setVerDomingo(false)}>
                Voltar ao resumo
              </Botao>
            </Stack>
            {carregandoDomingo ? (
              <IndicadorCarregando texto="Carregando entradas..." />
            ) : entradasDomingo.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Nenhuma entrada registrada neste domingo.
              </Typography>
            ) : (
              <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
                {entradasDomingo.map((entrada) => (
                  <Stack
                    key={entrada.id}
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: "flex-start", py: 1 }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                      >
                        {entrada.nome}
                      </Typography>
                      <CaixasDeInfo
                        itens={[
                          entrada.turmaRotulo,
                          entrada.horario,
                          entrada.momento ? rotuloMomento(entrada.momento) : "",
                        ]}
                        sx={{ mt: 1 }}
                      />
                      <CaixasDeInfo itens={partesDoMotivo(entrada.motivo)} sx={{ mt: 1 }} />
                    </Box>
                    <BotaoIcone
                      rotulo={`Remover entrada de ${entrada.nome}`}
                      variante="texto"
                      icone={<DeleteOutlineRoundedIcon />}
                      sx={{ color: "falta.texto" }}
                      disabled={executando}
                      onClick={() => setRemover(entrada)}
                    />
                  </Stack>
                ))}
              </Stack>
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
                Registrar entrada
              </Typography>
              <FormularioPadrao
                colunas={1}
                acoes={
                  <Botao
                    variante="secundario"
                    type="submit"
                    disabled={
                      !alunoId ||
                      !momento ||
                      !responsavelCodigo ||
                      carregando ||
                      opcoesResponsavel.length === 0 ||
                      (formaJustificativa === "catalogo" && !justificativa)
                    }
                    carregando={executando}
                    sx={{ width: { xs: "100%", sm: "auto" } }}
                  >
                    Registrar entrada
                  </Botao>
                }
              >
                <Stack spacing={1} useFlexGap>
                  <CamposMovimentacao
                    tipo="entrada"
                    turma={turma}
                    alunoId={alunoId}
                    momento={momento}
                    horario={horarioEfetivo}
                    responsavel={responsavelCodigo}
                    forma={formaJustificativa}
                    texto={motivo}
                    justificativa={justificativa}
                    observacao={observacao}
                    opcoesTurma={opcoesTurma}
                    opcoesAluno={opcoesAluno}
                    opcoesMomento={OPCOES_MOMENTO}
                    opcoesJustificativa={opcoesJustificativa}
                    opcoesResponsavel={opcoesResponsavel}
                    fuso={fuso}
                    enviando={executando}
                    textoObrigatorio
                    mostrarObservacao
                    responsavelDepois
                    descricaoResponsavel={
                      opcoesResponsavel.length === 0
                        ? "Nenhum responsável cadastrado. Cadastre em Gestão, Configurações."
                        : undefined
                    }
                    onTurma={(valor) => {
                      setTurma(valor);
                      setErro("");
                      setAlunoId("");
                    }}
                    onAluno={setAlunoId}
                    onMomento={setMomento}
                    onHorario={setHorario}
                    onResponsavel={setResponsavelCodigo}
                    onForma={(valor) => {
                      setFormaJustificativa(valor);
                      setMotivo("");
                      setJustificativa("");
                      setObservacao("");
                    }}
                    onTexto={setMotivo}
                    onJustificativa={setJustificativa}
                    onObservacao={setObservacao}
                  />
                </Stack>
              </FormularioPadrao>
            </Stack>
          </Paper>
          {erro && <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />}
          <HistoricoDiarioMovimentacoes
            titulo={`Entradas em ${rotuloData(dia)}`}
            rotuloRegiao="Entradas registradas"
            carregando={carregando}
            falha={leitura.estado === "falha" ? leitura.falha : undefined}
            onTentarNovamente={reler}
            textoCarregando="Carregando entradas..."
            textoVazio="Nenhuma entrada registrada neste recorte."
            registros={entradas.map((entrada) => ({
              id: entrada.id,
              nome: entrada.nome,
              itens: [
                entrada.turmaRotulo,
                entrada.horario,
                entrada.momento ? rotuloMomento(entrada.momento) : "",
                ...partesDoMotivo(entrada.motivo),
              ],
              rodape: `Responsável pelo registro: ${entrada.responsavelRegistroNome ?? entrada.registradoPorNome}`,
              acao: (
                <BotaoIcone
                  rotulo={`Remover entrada de ${entrada.nome}`}
                  variante="texto"
                  icone={<DeleteOutlineRoundedIcon />}
                  sx={{ color: "falta.texto" }}
                  disabled={executando}
                  onClick={() => setRemover(entrada)}
                />
              ),
            }))}
          />
        </>
      )}
      <DialogoConfirmarMovimentacao
        aberto={confirmacaoAberta}
        onAbrir={setConfirmacaoAberta}
        titulo="Registrar entrada?"
        descricao="Confira os dados antes de registrar. Depois de salvo, o lançamento aparece na lista do dia e nos relatórios."
        rotuloConfirmar="Registrar entrada"
        onConfirmar={() => void registrarEntrada()}
        itens={[
          { rotulo: "Aluno", valor: alunoConfirmacao?.nome ?? "" },
          {
            rotulo: "Turma",
            valor: alunoConfirmacao ? (turmasPorId.get(alunoConfirmacao.turmaId) ?? "") : "",
          },
          { rotulo: "Dia", valor: rotuloData(dia) },
          { rotulo: "Momento", valor: momento ? rotuloMomento(momento) : "" },
          { rotulo: "Horário", valor: horarioEfetivo },
          { rotulo: "Justificativa", valor: justificativaConfirmacao },
          {
            rotulo: "Observação",
            valor: formaJustificativa === "catalogo" ? observacao.trim() : "",
          },
          { rotulo: "Responsável", valor: responsavelConfirmacao },
        ]}
      />
      <DialogoConfirmacao
        aberto={Boolean(remover)}
        titulo="Remover esta entrada?"
        descricao={
          <>
            O registro de {remover?.nome ?? "aluno"} será removido do aplicativo para correção. A
            chamada e as linhas já enviadas à planilha serão preservadas.
          </>
        }
        onConfirmar={() => {
          if (!remover) return;
          const alvo = remover;
          void executar(async () => {
            await pedir(`/api/entradas/${alvo.id}`, { method: "DELETE" });
            setRemover(null);
            setVersao((valor) => valor + 1);
            avisarSucesso("Entrada removida.");
          });
        }}
        onCancelar={() => {
          if (!executando) setRemover(null);
        }}
        rotuloConfirmar="Remover entrada"
        destrutivo
        operacaoEmAndamento={executando}
      />
    </Box>
  );
}
