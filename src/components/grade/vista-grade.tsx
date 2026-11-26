"use client";

// Grade de frequência por turma de origem, com P, F, FJ e S, coluna fixa e exportação.
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import TableViewRoundedIcon from "@mui/icons-material/TableViewRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Fade from "@mui/material/Fade";
import Stack from "@mui/material/Stack";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { ESPACO_COMPOSICAO } from "@/theme/layout";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";
import {
  descricaoDaProporcao,
  rotuloDaAula,
  textoDaJustificativa,
  textoProporcao,
} from "@/domain/detalhe-grade";
import type {
  Aluno,
  Frequencia,
  Justificativa,
  ModoPeriodo,
  ResumoAcumulado,
  Turma,
} from "@/domain/frequencia";
import {
  diasDoMes,
  diasDoPeriodo,
  JUSTIFICATIVAS_PADRAO,
  mesSeguinte,
  montarGrade,
  normalizar,
  rotuloData,
  rotuloDiaSemana,
  rotuloMes,
} from "@/domain/frequencia";
import { nomeArquivoCsv, paraCsv, turmaPlanilhaDaGrade } from "@/domain/planilha";
import DialogoDownload from "@/components/conta/dialogo-download";
import DialogoEnvio, { useEstadoPlanilha } from "@/components/grade/dialogo-envio";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Rotulo } from "@/components/ui/mui/rotulo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";

interface Props {
  alunos: Aluno[];
  frequencias: Frequencia[];
  resumo: ResumoAcumulado | null;
  mes: string;
  mesCorrente: string;
  hoje: string;
  aberto: boolean;
  versao: number;
  atualizacao?: number;
  origens: Turma[];
  justificativas?: readonly Justificativa[];
  onMes: (mes: string) => void;
}

// Fixa somente as células de identidade da Grade, que mistura th e td na mesma linha.
const colunaAlunoFixa = { position: "sticky", left: 0, bgcolor: "background.paper" } as const;

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
  atualizacao = 0,
  origens,
  justificativas = JUSTIFICATIVAS_PADRAO,
  onMes,
}: Props) {
  const { avisarSucesso } = useAvisosDaSessao();
  const semMovimento = !useAnimacoesDaInterface().animacoesAtivas;
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<ModoPeriodo>("mes");
  const [diaBase, setDiaBase] = useState(hoje);
  const [diaFim, setDiaFim] = useState(hoje);
  const [doPeriodo, setDoPeriodo] = useState<Frequencia[] | null>(null);
  useLeituraDaVisao(aberto && modo !== "mes" && doPeriodo === null && !erro);
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false);
  const [envioAberto, setEnvioAberto] = useState(false);
  const { estado: estadoPlanilha, recarregar: recarregarPlanilha } = useEstadoPlanilha();

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
    if (modo === "mes" || !aberto) return;
    const primeiro = dias[0] ?? diaBase;
    const ultimo = dias[dias.length - 1] ?? diaBase;
    const controlador = new AbortController();
    let viva = true;
    async function buscar() {
      setCarregandoPeriodo(true);
      setErro("");
      try {
        const dados = await pedir<{ frequencias: Frequencia[] }>(
          `/api/frequencias?de=${primeiro}&ate=${ultimo}`,
          { signal: controlador.signal },
        );
        if (viva) setDoPeriodo(dados.frequencias);
      } catch (excecao) {
        if (viva) {
          setErro(
            excecao instanceof ErroApi ? excecao.message : "Não foi possível buscar o período.",
          );
          setErroVariante(estadoDeErro(excecao));
        }
      } finally {
        if (viva) setCarregandoPeriodo(false);
      }
    }
    void buscar();
    return () => {
      viva = false;
      controlador.abort();
    };
  }, [aberto, modo, dias, diaBase, versao, atualizacao]);

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

  const nomes = useMemo(
    () => new Map(grade.linhas.map((linha) => [linha.aluno.id, normalizar(linha.aluno.nome)])),
    [grade.linhas],
  );
  const termo = useDeferredValue(normalizar(busca));
  const linhas = useMemo(
    () =>
      grade.linhas.filter((linha) => termo === "" || nomes.get(linha.aluno.id)?.includes(termo)),
    [grade.linhas, nomes, termo],
  );

  const acumuladoDe = useMemo(() => {
    const mapa = new Map(
      (resumo?.porAluno ?? []).map((item) => [item.alunoId, item.faltas + item.faltasJustificadas]),
    );
    return (alunoId: string) => mapa.get(alunoId) ?? 0;
  }, [resumo]);

  const turmaAtualDe = useMemo(() => {
    const mapa = new Map(origens.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [origens]);

  const [download, setDownload] = useState<null | "csv" | "pdf">(null);
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const horarioPorId = useMemo(
    () =>
      new Map(origens.flatMap((turma) => turma.horarios).map((horario) => [horario.id, horario])),
    [origens],
  );

  function alternarFaltas(alunoId: string) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(alunoId)) proximo.delete(alunoId);
      else proximo.add(alunoId);
      return proximo;
    });
  }

  // A busca da tela não interfere: a planilha leva todos os alunos ativos.
  function prepararPlanilha() {
    const turma = turmaPlanilhaDaGrade(
      turmaEfetiva,
      rotuloDe(turmaEfetiva),
      grade.dias,
      grade.linhas,
      turmaAtualDe,
    );
    const blob = new Blob([paraCsv(turma)], { type: "text/csv;charset=utf-8" });
    return {
      blob,
      nome: nomeArquivoCsv(turma),
      nomeNoZip: "grade.csv",
      nomeZip: "frequenciapp-grade.zip",
      registro: "grade" as const,
    };
  }

  async function prepararPdf() {
    const primeiro = grade.dias[0] ?? hoje;
    const ultimo = grade.dias[grade.dias.length - 1] ?? hoje;
    // O mês em curso inclui dias futuros. O retrato para em hoje.
    if (primeiro > hoje) throw new ErroApi("O período ainda não começou.", 400);
    const ate = ultimo > hoje ? hoje : ultimo;
    const dados = await pedir<{ nome: string; pdf: string }>(
      "/api/relatorios/grade",
      corpoJson({ turmaOriginalId: turmaEfetiva, de: primeiro, ate }),
    );
    const bytes = Uint8Array.from(atob(dados.pdf), (caractere) => caractere.charCodeAt(0));
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      nome: dados.nome,
      nomeNoZip: "relatorio.pdf",
      nomeZip: "frequenciapp-relatorio.zip",
    };
  }

  return (
    <Box
      component="section"
      aria-label="Grade de frequência"
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
      >
        <Stack spacing={ESPACO_COMPOSICAO.tituloDescricao} useFlexGap>
          <Typography component="h2" variant="h4">
            Grade
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Frequência por turma de origem.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          {estadoPlanilha?.podeEnviar ? (
            <Botao
              variante="contorno"
              icone={<SendRoundedIcon />}
              aria-label="Enviar para a planilha"
              onClick={() => setEnvioAberto(true)}
              disabled={grade.linhas.length === 0 || carregandoPeriodo}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                Enviar para a planilha
              </Box>
            </Botao>
          ) : null}
          <BotaoIcone
            rotulo="Baixar relatório (PDF)"
            variante="contorno"
            icone={<PictureAsPdfRoundedIcon />}
            title="Baixar relatório (PDF) da turma de origem"
            onClick={() => setDownload("pdf")}
            disabled={grade.linhas.length === 0 || carregandoPeriodo}
            sx={{ width: 48, height: 48 }}
          />
          <BotaoIcone
            rotulo="Baixar planilha (CSV)"
            variante="secundario"
            icone={<DownloadRoundedIcon />}
            title="Baixar planilha (CSV) da turma de origem"
            onClick={() => setDownload("csv")}
            disabled={grade.linhas.length === 0 || carregandoPeriodo}
            sx={{ width: 48, height: 48 }}
          />
        </Stack>
      </Stack>

      <Box sx={{ display: { xs: "block", sm: "none" } }}>
        <Selecionar
          ariaLabel="Turma de origem da grade"
          valor={turmaEfetiva}
          onValor={setTurmaId}
          truncarRotuloSelecionado
          quebrarRotulosDasOpcoes
          opcoes={turmasOriginais.map((turma) => ({
            valor: turma.id,
            rotulo: `${turma.rotulo} (${alunos.filter((aluno) => aluno.ativo && aluno.turmaOriginalId === turma.id).length})`,
          }))}
        />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ display: { xs: "none", sm: "flex" }, flexWrap: "wrap" }}
      >
        {turmasOriginais.map((turma) => {
          const ativo = turma.id === turmaEfetiva;
          const quantidade = alunos.filter(
            (aluno) => aluno.ativo && aluno.turmaOriginalId === turma.id,
          ).length;
          return (
            <Botao
              key={turma.id}
              variante="contorno"
              aria-pressed={ativo}
              onClick={() => setTurmaId(turma.id)}
              sx={{
                minHeight: 48,
                bgcolor: ativo ? "action.selected" : undefined,
                borderColor: ativo ? "primary.main" : undefined,
              }}
            >
              <Box component="span">{turma.rotulo}</Box>
              <Box
                component="span"
                sx={{ ml: 1, fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}
              >
                {quantidade}
              </Box>
            </Botao>
          );
        })}
      </Stack>

      <Stack spacing={2}>
        <Box sx={{ maxWidth: { sm: 320 } }}>
          <Selecionar
            id="grade-modo"
            valor={modo}
            onValor={(valor) => {
              const proximo = MODOS.find((item) => item.valor === valor)?.valor;
              if (!proximo) return;
              setModo(proximo);
              setDoPeriodo(null);
            }}
            ariaLabel="Período da consulta"
            opcoes={MODOS.map((item) => ({ valor: item.valor, rotulo: item.rotulo }))}
          />
        </Box>

        {modo === "mes" ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <BotaoIcone
              rotulo="Mês anterior"
              variante="contorno"
              icone={<ChevronLeftRoundedIcon />}
              onClick={() => onMes(mesSeguinte(mes, -1))}
              sx={{ width: 48, height: 48 }}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <SeletorPeriodo
                id="mes-grade"
                modo="mes"
                valor={mes}
                max={mesCorrente}
                rotuloAcessivel="Mês da consulta"
                rotulo={rotuloMes(mes)}
                onValor={onMes}
              />
            </Box>
            <BotaoIcone
              rotulo="Mês seguinte"
              variante="contorno"
              icone={<ChevronRightRoundedIcon />}
              disabled={mes >= mesCorrente}
              onClick={() => onMes(mesSeguinte(mes, 1))}
              sx={{ width: 48, height: 48 }}
            />
          </Stack>
        ) : (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { xs: "stretch", sm: "flex-end" } }}
          >
            <Stack spacing={1} sx={{ minWidth: 0, flex: { sm: 1 } }}>
              <Rotulo htmlFor="grade-dia" sx={{ mb: 0, typography: "caption", fontWeight: 500 }}>
                {modo === "periodo" ? "De" : modo === "semana" ? "Data da semana" : "Data"}
              </Rotulo>
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
            </Stack>
            {modo === "periodo" ? (
              <Stack spacing={1} sx={{ minWidth: 0, flex: { sm: 1 } }}>
                <Rotulo
                  htmlFor="grade-dia-fim"
                  sx={{ mb: 0, typography: "caption", fontWeight: 500 }}
                >
                  Até
                </Rotulo>
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
              </Stack>
            ) : null}
            {modo === "semana" ? (
              <Typography variant="caption" sx={{ color: "text.secondary", pb: 1 }}>
                Segunda a sexta da semana escolhida.
              </Typography>
            ) : null}
          </Stack>
        )}

        {modo === "mes" && mes !== mesCorrente ? (
          <Box sx={{ display: "flex" }}>
            <Botao
              variante="secundario"
              icone={<ReplayRoundedIcon />}
              onClick={() => onMes(mesCorrente)}
            >
              Voltar para este mês
            </Botao>
          </Box>
        ) : null}
      </Stack>

      {erro ? <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" /> : null}

      {turmasOriginais.length === 0 ? (
        <EstadoVazio
          icone={<TableViewRoundedIcon />}
          titulo="Sem alunos ativos"
          descricao="Quando houver alunos nas suas turmas, a consulta aparece aqui."
        />
      ) : (
        <Fade
          key={`${turmaEfetiva}-${modo}`}
          in
          appear={!semMovimento}
          timeout={semMovimento ? 0 : 220}
        >
          <Box sx={{ minWidth: 0 }}>
            <BarraBusca
              id="busca-grade"
              valor={busca}
              onValor={setBusca}
              placeholder="Buscar aluno"
              sx={{ mb: 2 }}
            />
            {carregandoPeriodo ? (
              <Stack
                direction="row"
                spacing={1}
                role="status"
                sx={{ alignItems: "center", justifyContent: "center", minHeight: 160 }}
              >
                <CircularProgress size={18} aria-hidden="true" />
                <TextoDeCarregamento>Buscando o período...</TextoDeCarregamento>
              </Stack>
            ) : linhas.length === 0 ? (
              <Box sx={{ py: 5, textAlign: "center" }}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Nenhum aluno encontrado para esta busca.
                </Typography>
              </Box>
            ) : (
              <TabelaPadrao
                larguraIntrinseca
                arrastarHorizontalComMouse
                rotuloRolagem="Rolagem da Grade de frequência"
                caption={`Frequência dos alunos da turma original ${rotuloDe(turmaEfetiva)} no período`}
              >
                <TableHead>
                  <TableRow>
                    <TableCell
                      scope="col"
                      sx={{
                        ...colunaAlunoFixa,
                        zIndex: 3,
                        minWidth: 144,
                        borderRight: 1,
                        borderColor: "divider",
                        textAlign: "left",
                      }}
                    >
                      Aluno
                    </TableCell>
                    {grade.dias.map((dia) => (
                      <TableCell
                        key={dia}
                        scope="col"
                        align="center"
                        sx={{
                          width: 32,
                          borderLeft: 1,
                          borderColor: "divider",
                          px: 0.5,
                          fontSize: 11,
                          fontVariantNumeric: "tabular-nums",
                          bgcolor: dia === hoje ? "action.selected" : undefined,
                          color: dia === hoje ? "primary.main" : "text.secondary",
                        }}
                      >
                        {mesmoMes(dia, grade.dias) ? dia.slice(8) : dataCurta(dia)}
                      </TableCell>
                    ))}
                    {(
                      [
                        ["F", "Faltas no período"],
                        ["FJ", "Faltas justificadas no período"],
                        ["S", "Presenças parciais no período"],
                        ["Histórico", "Faltas de todo o histórico"],
                      ] as const
                    ).map(([rotulo, nome]) => (
                      <TableCell
                        key={rotulo}
                        scope="col"
                        align="center"
                        aria-label={nome}
                        title={nome}
                        sx={{
                          width: "1px",
                          whiteSpace: "nowrap",
                          borderLeft: 1,
                          borderColor: "divider",
                          px: 1,
                          fontSize: 11,
                          color: "text.secondary",
                        }}
                      >
                        {rotulo}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linhas.map((linha) => {
                    const aberto = abertos.has(linha.aluno.id);
                    const idDetalhe = `faltas-${linha.aluno.id}`;
                    return (
                      <Fragment key={linha.aluno.id}>
                        <TableRow>
                          <TableCell
                            component="th"
                            scope="row"
                            aria-label={`${linha.aluno.nome} atual ${turmaAtualDe(linha.aluno.turmaId)}`}
                            sx={{
                              ...colunaAlunoFixa,
                              zIndex: 2,
                              maxWidth: 176,
                              borderRight: 1,
                              borderColor: "divider",
                              textAlign: "left",
                              fontWeight: 400,
                            }}
                          >
                            <Typography noWrap sx={{ fontSize: "0.875rem" }}>
                              {linha.aluno.nome}
                            </Typography>
                            <Typography
                              noWrap
                              component="span"
                              sx={{ display: "block", fontSize: 10, color: "text.secondary" }}
                            >
                              atual {turmaAtualDe(linha.aluno.turmaId)}
                            </Typography>
                            <Botao
                              variante="texto"
                              tamanho="pequeno"
                              aria-expanded={aberto}
                              aria-controls={aberto ? idDetalhe : undefined}
                              aria-label={
                                aberto
                                  ? `Ocultar faltas de ${linha.aluno.nome}`
                                  : `Ver faltas de ${linha.aluno.nome}`
                              }
                              onClick={() => alternarFaltas(linha.aluno.id)}
                              sx={{ minHeight: 32, px: 0, justifyContent: "flex-start" }}
                            >
                              {aberto ? "Ocultar" : "Ver faltas"}
                            </Botao>
                          </TableCell>
                          {grade.dias.map((dia) => {
                            const marca = linha.marcas[dia];
                            const proporcao = linha.proporcoes[dia];
                            return (
                              <TableCell
                                key={dia}
                                align="center"
                                sx={{
                                  borderLeft: 1,
                                  borderColor: "divider",
                                  px: 0.5,
                                  py: 0.5,
                                  bgcolor: dia === hoje ? "action.hover" : undefined,
                                }}
                              >
                                {marca === "F" || marca === "FJ" ? (
                                  <Box
                                    component="span"
                                    role="img"
                                    aria-label={`${linha.aluno.nome} com ${
                                      marca === "FJ" ? "falta justificada" : "falta"
                                    } em ${dia}`}
                                    sx={[
                                      {
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: 20,
                                        height: 20,
                                        px: 0.25,
                                        borderRadius: "4px",
                                        fontSize: marca === "FJ" ? 9 : 10,
                                        fontWeight: 700,
                                        lineHeight: 1,
                                      },
                                      marca === "FJ"
                                        ? (tema) => ({
                                            border: 1,
                                            borderColor: tema.vars.palette.justificada.main,
                                            color: tema.vars.palette.justificada.texto,
                                          })
                                        : (tema) => ({
                                            bgcolor: tema.vars.palette.falta.main,
                                            color: tema.vars.palette.falta.contrastText,
                                          }),
                                    ]}
                                  >
                                    {marca}
                                  </Box>
                                ) : marca === "S" ? (
                                  <Box
                                    component="span"
                                    role="img"
                                    aria-label={
                                      proporcao
                                        ? descricaoDaProporcao(linha.aluno.nome, dia, proporcao)
                                        : `${linha.aluno.nome} presente em parte das aulas em ${dia}`
                                    }
                                    sx={(tema) => ({
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      minWidth: 28,
                                      height: 20,
                                      px: 0.25,
                                      border: 1,
                                      borderColor: tema.vars.palette.falta.main,
                                      borderRadius: "4px",
                                      color: tema.vars.palette.falta.texto,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      fontVariantNumeric: "tabular-nums",
                                    })}
                                  >
                                    {proporcao ? textoProporcao(proporcao) : "S"}
                                  </Box>
                                ) : marca === "P" ? (
                                  <Box
                                    component="span"
                                    role="img"
                                    aria-label={`${linha.aluno.nome} presente em ${dia}`}
                                    sx={{
                                      display: "inline-block",
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      bgcolor: "primary.main",
                                      opacity: 0.6,
                                    }}
                                  />
                                ) : (
                                  <Box
                                    component="span"
                                    role="img"
                                    aria-label={`${linha.aluno.nome} sem frequência em ${dia}`}
                                    sx={{
                                      display: "inline-block",
                                      minWidth: 1,
                                      minHeight: 1,
                                      fontSize: 10,
                                      color: "text.disabled",
                                    }}
                                  />
                                )}
                              </TableCell>
                            );
                          })}
                          {(
                            [
                              linha.faltas,
                              linha.justificadas,
                              linha.parciais,
                              acumuladoDe(linha.aluno.id) > 0 ? acumuladoDe(linha.aluno.id) : "",
                            ] as const
                          ).map((valor, indice) => (
                            <TableCell
                              key={indice}
                              align="center"
                              sx={{
                                borderLeft: 1,
                                borderColor: "divider",
                                px: 1,
                                whiteSpace: "nowrap",
                                color: indice === 3 ? "falta.texto" : "text.primary",
                                fontWeight: indice === 3 ? 600 : 500,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {valor}
                            </TableCell>
                          ))}
                        </TableRow>
                        {aberto ? (
                          <TableRow>
                            <TableCell
                              id={idDetalhe}
                              colSpan={grade.dias.length + 5}
                              sx={{ bgcolor: "action.hover", textAlign: "left" }}
                            >
                              {linha.detalhes.length === 0 ? (
                                <Typography variant="caption">Nenhuma falta no período.</Typography>
                              ) : (
                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                  {linha.detalhes.map((detalhe) => (
                                    <Box component="li" key={detalhe.dia} sx={{ mb: 0.5 }}>
                                      <Typography
                                        variant="caption"
                                        component="span"
                                        sx={{ fontWeight: 600 }}
                                      >
                                        {rotuloData(detalhe.dia)}{" "}
                                        {detalhe.proporcao
                                          ? textoProporcao(detalhe.proporcao)
                                          : detalhe.marca}
                                      </Typography>
                                      <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                        {detalhe.aulas.length === 0 ? (
                                          <Typography component="li" variant="caption">
                                            Sem aula identificada
                                          </Typography>
                                        ) : (
                                          detalhe.aulas.map((aula) => (
                                            <Typography
                                              component="li"
                                              variant="caption"
                                              key={aula.horarioId}
                                            >
                                              {rotuloDaAula(
                                                horarioPorId.get(aula.horarioId),
                                                detalhe.dia,
                                              )}
                                              {"; "}
                                              {textoDaJustificativa(aula, justificativas)}
                                            </Typography>
                                          ))
                                        )}
                                      </Box>
                                    </Box>
                                  ))}
                                </Box>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </TabelaPadrao>
            )}
            <Stack spacing={1} sx={{ mt: 2, color: "text.secondary" }}>
              <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Box
                    aria-hidden="true"
                    sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main" }}
                  />
                  <Typography variant="caption">presente</Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 16,
                      height: 16,
                      borderRadius: "3px",
                      bgcolor: "falta.main",
                      color: "falta.contrastText",
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    F
                  </Box>
                  <Typography variant="caption">falta</Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 16,
                      px: 0.25,
                      borderRadius: "3px",
                      border: 1,
                      borderColor: "justificada.main",
                      color: "justificada.texto",
                      fontSize: 8,
                      fontWeight: 700,
                    }}
                  >
                    FJ
                  </Box>
                  <Typography variant="caption">falta justificada</Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 16,
                      height: 16,
                      borderRadius: "3px",
                      border: 1,
                      borderColor: "falta.main",
                      color: "falta.texto",
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    S
                  </Box>
                  <Typography variant="caption">presente em parte das aulas</Typography>
                </Stack>
              </Stack>
              <Box component="details">
                <Typography
                  component="summary"
                  variant="caption"
                  sx={{ cursor: "pointer", py: 0.5, color: "primary.main", fontWeight: 500 }}
                >
                  Como ler
                </Typography>
                <Stack spacing={0.5} sx={{ pt: 0.5 }}>
                  <Typography variant="caption">
                    F, FJ e S: totais do período. Histórico: faltas (F + FJ) de todo o histórico.
                  </Typography>
                  <Typography variant="caption">
                    Célula S: aulas faltadas sobre as aulas do dia, como 2/5. O PDF vai até hoje.
                  </Typography>
                  <Typography variant="caption">
                    Célula vazia: turma sem frequência no dia.
                  </Typography>
                  <Typography variant="caption">
                    Baixar planilha: todos os alunos ativos da turma de origem.
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Fade>
      )}

      <DialogoDownload
        aberto={download !== null}
        onAbrir={(aberto) => {
          if (!aberto) setDownload(null);
        }}
        preparar={download === "pdf" ? prepararPdf : prepararPlanilha}
        onConcluido={() =>
          avisarSucesso(
            download === "pdf" ? "Relatório baixado." : "Planilha baixada.",
            download === "pdf"
              ? "O PDF traz o resumo, o detalhe e o retrato da leitura."
              : "O arquivo leva todos os alunos ativos da turma de origem.",
          )
        }
      />
      {estadoPlanilha?.podeEnviar && grade.dias.length > 0 ? (
        <DialogoEnvio
          aberto={envioAberto}
          onAbrir={setEnvioAberto}
          turmaOriginalId={turmaEfetiva}
          rotulo={rotuloDe(turmaEfetiva)}
          de={grade.dias[0] ?? hoje}
          ate={grade.dias[grade.dias.length - 1] ?? hoje}
          modoCompleto={estadoPlanilha.modo === "completo"}
          aoConcluir={() => void recarregarPlanilha()}
        />
      ) : null}
    </Box>
  );
}

/** Verdadeiro quando o dia pertence a um período dentro de um único mês. */
function mesmoMes(dia: string, dias: string[]): boolean {
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  if (!primeiro || !ultimo) return true;
  return primeiro.slice(0, 7) === ultimo.slice(0, 7) && primeiro.slice(0, 7) === dia.slice(0, 7);
}
