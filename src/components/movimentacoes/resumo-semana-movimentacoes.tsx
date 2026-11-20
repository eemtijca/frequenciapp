"use client";

// Resumo semanal de uma aba de Saídas e Entradas, com todas as turmas da área.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { EntradaAtrasada } from "@/domain/entradas";
import type { Aluno, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDataCurta, rotuloDiaSemana } from "@/domain/frequencia";
import { resumirMovimentacoes } from "@/domain/resumo-semana-movimentacoes";
import { pedir } from "@/lib/api-cliente";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { AtualizadoEm } from "@/components/ui/mui/atualizado-em";
import { Botao } from "@/components/ui/mui/botao";
import { Selo } from "@/components/ui/mui/selo";
import { useResumoSemanal } from "@/components/resumo-semanal/use-resumo-semanal";

interface Props {
  tipo: "saida" | "entrada";
  turmas: Turma[];
  alunos: Aluno[];
  dias: readonly string[];
  domingo?: string | null;
  versao?: number;
  ativo: boolean;
  pausado?: boolean;
  fuso: string;
  onAbrirDia: (dia: string) => void;
  onVerDomingo?: () => void;
}

interface DadosMovimentacao {
  saidas: SaidaAntecipada[];
  entradas: EntradaAtrasada[];
}

const LIMITE_ALUNOS = 5;

const ESTILO_LEITOR = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function BarrasDia({
  dias,
  unidade,
  titulo,
}: {
  dias: { dia: string; rotulo: string; valor: number }[];
  unidade: [singular: string, plural: string];
  titulo: string;
}) {
  const maior = Math.max(1, ...dias.map((item) => item.valor));
  const total = dias.reduce((soma, item) => soma + item.valor, 0);
  const resumo = dias
    .map((item) => `${item.rotulo}: ${item.valor} ${item.valor === 1 ? unidade[0] : unidade[1]}`)
    .join("; ");

  return (
    <Box component="figure" sx={{ m: 0, display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography component="figcaption" variant="caption" sx={{ color: "text.secondary" }}>
        {titulo}: {total} {total === 1 ? unidade[0] : unidade[1]} na semana
      </Typography>
      <Box
        role="img"
        aria-label={`${titulo}. ${resumo}.`}
        sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}
      >
        {dias.map((item) => (
          <Box
            key={item.dia}
            sx={{
              minWidth: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <Box
              sx={{
                width: "100%",
                height: 96,
                display: "flex",
                alignItems: "flex-end",
                overflow: "hidden",
                borderRadius: 1,
                backgroundColor: "action.hover",
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: "100%",
                  height: `${Math.max(4, (item.valor / maior) * 100)}%`,
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  backgroundColor: "primary.main",
                }}
              />
            </Box>
            <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
              {item.rotulo}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
            >
              {item.valor}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function SecaoResumo({
  id,
  titulo,
  descricao,
  icone,
  resumo,
  aberto,
  onAbertoChange,
  children,
}: {
  id: string;
  titulo: string;
  descricao: string;
  icone: ReactNode;
  resumo: ReactNode;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Accordion
      expanded={aberto}
      onChange={(_evento, expandido) => onAbertoChange(expandido)}
      data-secao={`resumo-movimentacoes-${id}`}
      data-state={aberto ? "open" : "closed"}
      sx={{ "&:before": { display: "none" } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRoundedIcon />}
        id={`resumo-movimentacoes-${id}-cabecalho`}
        aria-controls={`resumo-movimentacoes-${id}-conteudo`}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "flex-start", minWidth: 0, flex: 1 }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 1,
              backgroundColor: "action.hover",
              color: "text.secondary",
            }}
          >
            {icone}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="span" sx={{ display: "block", fontWeight: 600 }}>
              {titulo}
            </Typography>
            <Typography
              component="span"
              variant="body2"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {descricao}
            </Typography>
            <Stack
              direction="row"
              spacing={0.5}
              useFlexGap
              sx={{ display: "flex", flexWrap: "wrap", mt: 1 }}
            >
              {resumo}
            </Stack>
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails id={`resumo-movimentacoes-${id}-conteudo`} sx={{ px: 2, pb: 2, pt: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

export function VistaResumoMovimentacoes({
  tipo,
  turmas,
  alunos,
  dias,
  domingo,
  versao = 0,
  ativo,
  pausado = false,
  fuso,
  onAbrirDia,
  onVerDomingo,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const periodo = `${de}|${ate}|${tipo}`;
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ visao: true });
  const [alunosExpandidos, setAlunosExpandidos] = useState(false);
  const [temDomingo, setTemDomingo] = useState(false);
  const periodoAnterior = useRef(periodo);
  const onVerDomingoRef = useRef(onVerDomingo);

  useEffect(() => {
    onVerDomingoRef.current = onVerDomingo;
  }, [onVerDomingo]);

  useEffect(() => {
    if (periodoAnterior.current === periodo) return;
    periodoAnterior.current = periodo;
    setAbertas({ visao: true });
    setAlunosExpandidos(false);
  }, [periodo]);

  useEffect(() => {
    if (!domingo || !onVerDomingoRef.current) return;
    let viva = true;
    const url =
      tipo === "saida"
        ? `/api/saidas?dia=${domingo}`
        : `/api/entradas?de=${domingo}&ate=${domingo}`;
    pedir<{ saidas?: SaidaAntecipada[]; entradas?: EntradaAtrasada[] }>(url)
      .then((dados) => {
        if (!viva) return;
        setTemDomingo((dados.saidas?.length ?? 0) + (dados.entradas?.length ?? 0) > 0);
      })
      .catch(() => {
        if (viva) setTemDomingo(false);
      });
    return () => {
      viva = false;
    };
  }, [domingo, tipo]);

  const carregar = useCallback(
    async (sinal: AbortSignal) => {
      const dados =
        tipo === "saida"
          ? await pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?de=${de}&ate=${ate}`, {
              signal: sinal,
            }).then((resposta) => ({
              saidas: resposta.saidas,
              entradas: [] as EntradaAtrasada[],
            }))
          : await pedir<{ entradas: EntradaAtrasada[] }>(`/api/entradas?de=${de}&ate=${ate}`, {
              signal: sinal,
            }).then((resposta) => ({
              saidas: [] as SaidaAntecipada[],
              entradas: resposta.entradas,
            }));
      return { dados, assinatura: JSON.stringify(dados) };
    },
    [ate, de, tipo],
  );

  const carga = useResumoSemanal<DadosMovimentacao>({
    periodo,
    versao,
    ativo,
    pausado,
    viewId: "saidas",
    fuso,
    carregar,
  });

  const resumo = useMemo(() => {
    if (!carga.dados) return null;
    if (tipo === "saida") {
      return resumirMovimentacoes("saida", {
        saidas: carga.dados.saidas,
        alunos,
        turmas,
        dias,
      });
    }
    return resumirMovimentacoes("entrada", {
      entradas: carga.dados.entradas,
      dias,
    });
  }, [alunos, carga.dados, dias, tipo, turmas]);

  function aberta(chave: string) {
    return abertas[chave] ?? false;
  }
  function alternar(chave: string, valor: boolean) {
    setAbertas((atual) => ({ ...atual, [chave]: valor }));
  }

  const singular = tipo === "saida" ? "saída" : "entrada";
  const plural = tipo === "saida" ? "saídas" : "entradas";
  const titulo = tipo === "saida" ? "Saídas da semana" : "Entradas da semana";

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Resumo da semana"
      aria-busy={!carga.dados}
      sx={{
        boxShadow: "none",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        component="header"
        sx={{
          p: 2,
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "flex-start", minWidth: 0, flex: 1 }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 1,
              backgroundColor: "action.hover",
              color: "text.secondary",
            }}
          >
            <CalendarMonthRoundedIcon fontSize="small" aria-hidden="true" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h6">
              {titulo}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {de && ate ? `${rotuloDataCurta(de)} a ${rotuloDataCurta(ate)}` : ""}
              {domingo ? `, encerrada em ${rotuloData(domingo)}` : ""}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {titulo} de todas as turmas da área.
            </Typography>
          </Box>
        </Stack>
        <Stack
          spacing={0.5}
          sx={{ flexShrink: 0, alignItems: { xs: "flex-start", sm: "flex-end" } }}
        >
          <Selo rotulo="Somente leitura" />
          <AtualizadoEm instante={carga.atualizadoEm ?? undefined} fuso={fuso} />
        </Stack>
      </Box>
      <Box sx={{ borderTop: 1, borderColor: "divider", p: 2 }}>
        <Stack spacing={2}>
          <Typography component="p" role="status" aria-live="polite" sx={ESTILO_LEITOR}>
            {carga.anuncio}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: "center", color: "text.secondary" }}
            >
              <CalendarMonthRoundedIcon fontSize="small" aria-hidden="true" />
              <Typography variant="caption">Resumo de todas as turmas.</Typography>
            </Stack>
            {domingo && onVerDomingo && temDomingo ? (
              <Botao type="button" variante="texto" onClick={onVerDomingo}>
                Ver registros do domingo
              </Botao>
            ) : null}
          </Stack>
          {carga.erro && carga.dados ? (
            <AlertaCompacto
              variante="indisponivel"
              descricao={carga.erro}
              tamanho="linha"
              acao={{ rotulo: "Tentar novamente", onClick: carga.tentarNovamente }}
            />
          ) : null}
          {!carga.dados && !carga.erro ? (
            <Stack
              direction="row"
              spacing={1}
              role="status"
              sx={{ alignItems: "center", justifyContent: "center", py: 4 }}
            >
              <CircularProgress size={18} aria-hidden="true" />
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Carregando resumo da semana...
              </Typography>
            </Stack>
          ) : null}
          {!carga.dados && carga.erro ? (
            <AlertaCompacto
              variante="indisponivel"
              descricao={carga.erro}
              tamanho="linha"
              acao={{ rotulo: "Tentar novamente", onClick: carga.tentarNovamente }}
            />
          ) : null}

          {resumo ? (
            <>
              <SecaoResumo
                id="visao"
                titulo="Visão geral"
                descricao="Totais e distribuição diária."
                icone={<ScheduleRoundedIcon fontSize="small" aria-hidden="true" />}
                aberto={aberta("visao")}
                onAbertoChange={(valor) => alternar("visao", valor)}
                resumo={
                  <>
                    <Selo rotulo={`${resumo.total} ${resumo.total === 1 ? singular : plural}`} />
                    <Selo rotulo={`${resumo.totalAlunos} alunos`} />
                    <Selo
                      rotulo={`${resumo.totalTurmas} ${
                        tipo === "saida" ? "turmas conhecidas" : "turmas"
                      }`}
                    />
                  </>
                }
              >
                <Stack spacing={2}>
                  <Box
                    sx={{
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <Grid container>
                      {[
                        [tipo === "saida" ? "Saídas" : "Entradas", resumo.total],
                        ["Alunos", resumo.totalAlunos],
                        [tipo === "saida" ? "Turmas conhecidas" : "Turmas", resumo.totalTurmas],
                      ].map(([rotulo, valor], indice) => (
                        <Grid
                          key={rotulo}
                          size={4}
                          sx={{
                            px: 1,
                            py: 1.5,
                            textAlign: "center",
                            borderLeft: indice === 0 ? 0 : 1,
                            borderColor: "divider",
                          }}
                        >
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            {rotulo}
                          </Typography>
                          <Typography
                            component="span"
                            sx={{
                              display: "block",
                              fontWeight: 600,
                              fontSize: "1.25rem",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {valor}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                  <BarrasDia
                    dias={resumo.dias.map((dia) => ({
                      dia: dia.dia,
                      rotulo: rotuloDiaSemana(dia.dia).replace("-feira", "").slice(0, 3),
                      valor: dia.total,
                    }))}
                    unidade={[singular, plural]}
                    titulo={tipo === "saida" ? "Saídas" : "Entradas"}
                  />
                  <Grid container spacing={1}>
                    {resumo.dias.map((dia) => (
                      <Grid key={dia.dia} size={{ xs: 6, sm: 4, xl: 2 }}>
                        <Box
                          component="button"
                          type="button"
                          data-dia={dia.dia}
                          aria-label={`Abrir ${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${dia.total} ${
                            dia.total === 1 ? singular : plural
                          }`}
                          onClick={() => onAbrirDia(dia.dia)}
                          sx={(tema) => ({
                            width: "100%",
                            minHeight: 128,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "stretch",
                            justifyContent: "flex-start",
                            gap: 1,
                            p: 1.5,
                            textAlign: "left",
                            font: "inherit",
                            color: "inherit",
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 2,
                            backgroundColor: "action.hover",
                            cursor: "pointer",
                            transition: tema.transitions.create(["background-color"], {
                              duration: 100,
                            }),
                            "&:hover": { backgroundColor: "action.selected" },
                            "&:focus-visible": {
                              outline: `3px solid ${tema.vars.palette.primary.main}`,
                              outlineOffset: 2,
                            },
                          })}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 1,
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{
                                  display: "block",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                }}
                              >
                                {rotuloDiaSemana(dia.dia).replace("-feira", "").slice(0, 3)}
                              </Typography>
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{ display: "block", color: "text.secondary" }}
                              >
                                {rotuloDataCurta(dia.dia)}
                              </Typography>
                            </Box>
                            <ChevronRightRoundedIcon
                              fontSize="small"
                              aria-hidden="true"
                              sx={{ color: "text.secondary", flexShrink: 0 }}
                            />
                          </Box>
                          <Box>
                            <Selo
                              rotulo={dia.total > 0 ? "Com registro" : "Sem registro"}
                              tom={dia.total > 0 ? "sucesso" : "neutro"}
                            />
                          </Box>
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ mt: "auto", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                          >
                            {dia.total}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </SecaoResumo>

              <SecaoResumo
                id="turmas"
                titulo="Turmas"
                descricao={
                  tipo === "saida"
                    ? "Total por referência histórica; turma desconhecida separada."
                    : "Total por turma na semana."
                }
                icone={<CalendarMonthRoundedIcon fontSize="small" aria-hidden="true" />}
                aberto={aberta("turmas")}
                onAbertoChange={(valor) => alternar("turmas", valor)}
                resumo={
                  <Selo
                    rotulo={`${resumo.totalTurmas} ${
                      tipo === "saida" ? "turmas conhecidas" : "turmas"
                    }`}
                  />
                }
              >
                {resumo.turmas.length === 0 ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Nenhuma movimentação nesta semana.
                  </Typography>
                ) : (
                  <Stack divider={<Divider flexItem />}>
                    {resumo.turmas.map((turma) => (
                      <Stack
                        key={
                          tipo === "saida"
                            ? JSON.stringify([turma.turmaId, turma.rotulo])
                            : turma.turmaId
                        }
                        direction="row"
                        spacing={2}
                        sx={{ alignItems: "center", justifyContent: "space-between", py: 1 }}
                      >
                        <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                          {turma.rotulo}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            flexShrink: 0,
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {turma.total}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </SecaoResumo>

              <SecaoResumo
                id="alunos"
                titulo="Alunos"
                descricao="Alunos com mais registros na semana."
                icone={<PeopleRoundedIcon fontSize="small" aria-hidden="true" />}
                aberto={aberta("alunos")}
                onAbertoChange={(valor) => alternar("alunos", valor)}
                resumo={<Selo rotulo={`${resumo.alunos.length} alunos`} />}
              >
                {resumo.alunos.length === 0 ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Nenhuma movimentação nesta semana.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    <TableContainer>
                      <Table size="small" aria-label="Alunos com mais registros na semana">
                        <Box component="caption" sx={ESTILO_LEITOR}>
                          Alunos com mais registros na semana
                        </Box>
                        <TableHead>
                          <TableRow>
                            <TableCell>Aluno</TableCell>
                            <TableCell align="right" sx={{ width: 96 }}>
                              {tipo === "saida" ? "Saídas" : "Entradas"}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(alunosExpandidos
                            ? resumo.alunos
                            : resumo.alunos.slice(0, LIMITE_ALUNOS)
                          ).map((aluno) => (
                            <TableRow key={aluno.alunoId}>
                              <TableCell
                                component="th"
                                scope="row"
                                sx={{ fontWeight: 400, overflowWrap: "anywhere" }}
                              >
                                {aluno.nome}
                                <Typography
                                  component="span"
                                  variant="caption"
                                  sx={{ display: "block", color: "text.secondary" }}
                                >
                                  {aluno.turma}
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                {aluno.total}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {resumo.alunos.length > LIMITE_ALUNOS ? (
                      <Botao
                        type="button"
                        variante="texto"
                        aria-expanded={alunosExpandidos}
                        onClick={() => setAlunosExpandidos((valor) => !valor)}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {alunosExpandidos ? "Mostrar menos" : "Ver a lista completa"}
                      </Botao>
                    ) : null}
                  </Stack>
                )}
              </SecaoResumo>
            </>
          ) : null}
        </Stack>
      </Box>
    </Paper>
  );
}
