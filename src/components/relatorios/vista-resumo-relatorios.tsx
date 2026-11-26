"use client";

// Resumo mensal com comparação de séries e turmas, evolução diária e rankings de faltas.
import { useMemo, useState } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  diasDoMes,
  mesSeguinte,
  rotuloDataCurta,
  rotuloMes,
  type Aluno,
  type Frequencia,
  type Serie,
  type Turma,
} from "@/domain/frequencia";
import {
  alunosPorFaltas,
  ausencias,
  distribuicaoDoPeriodo,
  evolucaoDoPeriodo,
  infrequencia,
  type CriterioRankingFaltas,
} from "@/domain/relatorios";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Cartao } from "@/components/ui/mui/cartao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { GraficoEvolucao } from "@/components/graficos/graficos-sob-demanda";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  mes: string;
  mesCorrente: string;
  diaCorrente: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  bloqueado: boolean;
  carregando: boolean;
  erro: string | null;
  onMes: (mes: string) => void;
}

const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const ESTILO_COLUNA_DIA = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  bgcolor: "background.paper",
} as const;

const RANKINGS: Record<
  CriterioRankingFaltas,
  {
    botao: string;
    titulo: string;
    vazio: string;
    unidade: [singular: string, plural: string];
  }
> = {
  todas: {
    botao: "Todas as faltas (F + FJ)",
    titulo: "Alunos com mais faltas",
    vazio: "Nenhuma falta registrada neste filtro.",
    unidade: ["falta", "faltas"],
  },
  faltas: {
    botao: "Sem justificativa (F)",
    titulo: "Alunos com mais faltas sem justificativa",
    vazio: "Nenhuma falta sem justificativa neste filtro.",
    unidade: ["falta", "faltas"],
  },
  justificadas: {
    botao: "Justificadas (FJ)",
    titulo: "Alunos com mais faltas justificadas",
    vazio: "Nenhuma falta justificada neste filtro.",
    unidade: ["justificada", "justificadas"],
  },
};

export default function ResumoRelatorios({
  mes,
  mesCorrente,
  diaCorrente,
  series,
  turmas,
  alunos,
  frequencias,
  bloqueado,
  carregando,
  erro,
  onMes,
}: Props) {
  const [serieId, setSerieId] = useState("todas");
  const [turmaId, setTurmaId] = useState("todas");
  const [compararPor, setCompararPor] = useState("turmas");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [criterioRanking, setCriterioRanking] = useState<CriterioRankingFaltas>("todas");
  const turmasVisiveis = useMemo(
    () => turmas.filter((turma) => serieId === "todas" || turma.serieId === serieId),
    [turmas, serieId],
  );
  const dados = useMemo(() => {
    const selecionadas = turmasVisiveis.filter(
      (turma) => turmaId === "todas" || turma.id === turmaId,
    );
    const ids = new Set(selecionadas.map((turma) => turma.id));
    const doFiltro = alunos.filter((aluno) => ids.has(aluno.turmaId));
    const dias = diasDoMes(mes).filter((dia) => dia <= diaCorrente);
    const porSerie = distribuicaoDoPeriodo(
      series,
      turmas,
      doFiltro,
      frequencias,
      dias[0] ?? mes,
      dias.at(-1) ?? mes,
    ).filter((serie) => selecionadas.some((turma) => turma.serieId === serie.serieId));
    const porTurma = porSerie
      .flatMap((serie) => serie.turmas)
      .filter((turma) => ids.has(turma.turmaId));
    const total = porTurma.reduce(
      (soma, turma) => ({
        registrados: soma.registrados + turma.registrados,
        faltas: soma.faltas + turma.faltas,
        justificadas: soma.justificadas + turma.justificadas,
        parciais: soma.parciais + turma.parciais,
      }),
      { registrados: 0, faltas: 0, justificadas: 0, parciais: 0 },
    );
    const evolucao = evolucaoDoPeriodo(doFiltro, turmas, frequencias, dias).map((dia) => ({
      ...dia,
      rotulo: rotuloDataCurta(dia.dia),
      valor: dia.taxa === null ? null : Math.round(dia.taxa * 1000) / 10,
    }));
    return { porSerie, porTurma, total, evolucao, doFiltro, dias };
  }, [alunos, diaCorrente, frequencias, mes, series, turmaId, turmas, turmasVisiveis]);
  const ranking = useMemo(
    () => alunosPorFaltas(dados.doFiltro, turmas, frequencias, dados.dias, criterioRanking),
    [dados.doFiltro, dados.dias, turmas, frequencias, criterioRanking],
  );
  const ocupado = carregando;
  const comparacoes =
    compararPor === "series"
      ? dados.porSerie.map((serie) => ({ ...serie, id: serie.serieId, rotulo: serie.nome }))
      : dados.porTurma.map((turma) => ({ ...turma, id: turma.turmaId }));
  const taxa =
    dados.total.registrados > 0
      ? percentual.format((dados.total.faltas + dados.total.justificadas) / dados.total.registrados)
      : "Sem registro";

  return (
    <Box
      component="section"
      aria-label="Resumo dos relatórios"
      aria-busy={ocupado}
      sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        useFlexGap
        role="group"
        aria-label="Período e escopo do resumo"
        sx={{ flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <Stack spacing={0.5} sx={{ flex: "1 1 288px", minWidth: 0 }}>
          <Typography component="h2" variant="h6">
            Resumo do mês
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", minHeight: TOKENS_LAYOUT.campo.medio }}
          >
            <BotaoIcone
              rotulo="Mês anterior do resumo"
              variante="contorno"
              icone={<ChevronLeftRoundedIcon />}
              disabled={bloqueado || ocupado}
              onClick={() => onMes(mesSeguinte(mes, -1))}
              sx={{ width: 48, height: 48 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <SeletorPeriodo
                id="mes-resumo"
                modo="mes"
                valor={mes}
                max={mesCorrente}
                disabled={bloqueado || ocupado}
                rotuloAcessivel="Mês do resumo"
                rotulo={`${rotuloMes(mes).slice(0, 3)}/${mes.slice(0, 4)}`}
                onValor={onMes}
              />
            </Box>
            <BotaoIcone
              rotulo="Mês seguinte do resumo"
              variante="contorno"
              icone={<ChevronRightRoundedIcon />}
              disabled={bloqueado || ocupado || mes >= mesCorrente}
              onClick={() => onMes(mesSeguinte(mes, 1))}
              sx={{ width: 48, height: 48 }}
            />
          </Stack>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flex: "2 1 336px", flexWrap: "wrap", minWidth: 0 }}
        >
          <Box sx={{ flex: "1 1 164px", minWidth: 0 }}>
            <Campo id="serie-resumo" rotulo="Série">
              <Selecionar
                ariaLabel="Série do resumo"
                valor={serieId}
                onValor={(valor) => {
                  setSerieId(valor);
                  setTurmaId("todas");
                }}
                truncarRotuloSelecionado
                quebrarRotulosDasOpcoes
                opcoes={[
                  { valor: "todas", rotulo: "Todas as séries" },
                  ...series.map((serie) => ({ valor: serie.id, rotulo: serie.nome })),
                ]}
              />
            </Campo>
          </Box>
          <Box sx={{ flex: "1 1 164px", minWidth: 0 }}>
            <Campo id="turma-resumo" rotulo="Turma">
              <Selecionar
                ariaLabel="Turma do resumo"
                valor={turmaId}
                onValor={setTurmaId}
                truncarRotuloSelecionado
                quebrarRotulosDasOpcoes
                opcoes={[
                  { valor: "todas", rotulo: "Todas as turmas" },
                  ...turmasVisiveis.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
                ]}
              />
            </Campo>
          </Box>
        </Stack>
      </Stack>

      {ocupado ? (
        <Box role="status" sx={{ py: 4, textAlign: "center" }}>
          <CircularProgress size={18} aria-hidden="true" />
          <TextoDeCarregamento>Carregando resumo...</TextoDeCarregamento>
        </Box>
      ) : erro ? (
        <AlertaCompacto variante="erro_interno" descricao={erro} tamanho="linha" />
      ) : (
        <>
          <Cartao sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Grid container component="dl" rowSpacing={1} columnSpacing={2} sx={{ m: 0 }}>
              {[
                { rotulo: "Faltas (F + FJ)", valor: dados.total.faltas + dados.total.justificadas },
                { rotulo: "Justificadas", valor: dados.total.justificadas },
                { rotulo: "Presenças parciais", valor: dados.total.parciais },
                { rotulo: "Infrequência", valor: taxa, destaque: true },
              ].map(({ rotulo, valor, destaque }) => (
                <Grid key={rotulo} size={{ xs: 6, sm: 3 }}>
                  <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
                    {rotulo}
                  </Typography>
                  <Typography
                    component="dd"
                    variant={destaque ? "h4" : "h5"}
                    sx={{ m: 0, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
                  >
                    {valor}
                  </Typography>
                </Grid>
              ))}
            </Grid>
            <Typography component="p" variant="caption" sx={{ color: "text.secondary", mt: 1 }}>
              Considera chamadas salvas. Dias sem registro ficam fora da taxa.
            </Typography>
          </Cartao>
          {dados.total.registrados === 0 ? (
            <EstadoVazio
              icone={<InsightsRoundedIcon />}
              titulo="Nenhuma chamada registrada para este filtro no mês."
              descricao="Escolha outro mês, série ou turma para consultar os indicadores."
            />
          ) : (
            <Stack
              direction="row"
              spacing={2}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "flex-start" }}
            >
              <Box sx={{ flex: "5 1 376px", minWidth: 0 }}>
                <Cartao
                  component="section"
                  aria-label={
                    compararPor === "series" ? "Infrequência por série" : "Infrequência por turma"
                  }
                  sx={{ height: "100%" }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      mb: 1.5,
                    }}
                  >
                    <Typography component="h3" variant="subtitle1">
                      Comparação
                    </Typography>
                    <Box sx={{ width: 128 }}>
                      <Selecionar
                        ariaLabel="Comparar por"
                        valor={compararPor}
                        onValor={setCompararPor}
                        opcoes={[
                          { valor: "turmas", rotulo: "Turmas" },
                          { valor: "series", rotulo: "Séries" },
                        ]}
                      />
                    </Box>
                  </Stack>
                  <Stack component="ul" spacing={1.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {comparacoes.map((turma) => (
                      <Box component="li" key={turma.id}>
                        <Stack
                          direction="row"
                          spacing={2}
                          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
                        >
                          <Typography sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>
                            {turma.rotulo}
                          </Typography>
                          <Typography
                            component="strong"
                            sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
                          >
                            {turma.registrados > 0
                              ? percentual.format(infrequencia(turma))
                              : "Sem registro"}
                          </Typography>
                        </Stack>
                        <Box aria-hidden="true" sx={{ mt: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={infrequencia(turma) * 100}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                        </Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", mt: 1 }}>
                          {ausencias(turma)} {ausencias(turma) === 1 ? "falta" : "faltas"} em{" "}
                          {turma.registrados} registros de aluno por dia
                          {turma.parciais > 0
                            ? ` · ${turma.parciais} ${
                                turma.parciais === 1 ? "parcial" : "parciais"
                              }`
                            : ""}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Cartao>
              </Box>
              <Box sx={{ flex: "7 1 512px", minWidth: 0 }}>
                <Cartao
                  component="section"
                  aria-label="Evolução da infrequência"
                  sx={{ height: "100%" }}
                >
                  <Typography component="h3" variant="subtitle1">
                    Evolução no mês
                  </Typography>
                  <GraficoEvolucao evolucao={dados.evolucao} />
                  <Box component="details" sx={{ mt: 0.5, "&[open] > summary": { mb: 1 } }}>
                    <Typography
                      component="summary"
                      variant="body2"
                      sx={(tema) => ({
                        cursor: "pointer",
                        minHeight: TOKENS_LAYOUT.alvoToque,
                        alignContent: "center",
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        color: "primary.main",
                        fontWeight: 500,
                        "&:hover": { bgcolor: "action.hover" },
                        "&:focus-visible": {
                          outline: `${TOKENS_LAYOUT.campo.foco}px solid ${tema.vars.palette.primary.main}`,
                          outlineOffset: 2,
                        },
                      })}
                    >
                      Ver dados diários
                    </Typography>
                    <TabelaPadrao
                      caption="Infrequência por dia no mês selecionado"
                      rotuloRolagem="Dados diários da infrequência"
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell scope="col" sx={{ ...ESTILO_COLUNA_DIA, zIndex: 3 }}>
                            Dia
                          </TableCell>
                          <TableCell scope="col" align="right">
                            F + FJ
                          </TableCell>
                          <TableCell scope="col" align="right">
                            Registros
                          </TableCell>
                          <TableCell scope="col" align="right">
                            Parciais
                          </TableCell>
                          <TableCell scope="col" align="right">
                            Taxa
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dados.evolucao.map((dia) => (
                          <TableRow key={dia.dia}>
                            <TableCell component="th" scope="row" sx={ESTILO_COLUNA_DIA}>
                              {dia.rotulo}
                            </TableCell>
                            <TableCell align="right">{ausencias(dia)}</TableCell>
                            <TableCell align="right">{dia.registrados}</TableCell>
                            <TableCell align="right">{dia.parciais}</TableCell>
                            <TableCell align="right">
                              {dia.taxa === null ? "Sem registro" : percentual.format(dia.taxa)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </TabelaPadrao>
                  </Box>
                </Cartao>
              </Box>
              <Box sx={{ width: "100%", minWidth: 0 }}>
                <Cartao component="section" aria-label="Alunos com mais faltas">
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                    }}
                  >
                    <Typography component="h3" variant="subtitle1">
                      {RANKINGS[criterioRanking].titulo}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      F: falta · FJ: justificada
                    </Typography>
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    role="group"
                    aria-label="Ranking de alunos"
                    sx={{ flexWrap: "wrap", mt: 2 }}
                  >
                    {(Object.keys(RANKINGS) as CriterioRankingFaltas[]).map((criterio) => {
                      const selecionado = criterioRanking === criterio;
                      return (
                        <Botao
                          key={criterio}
                          variante="contorno"
                          aria-pressed={selecionado}
                          onClick={() => {
                            setCriterioRanking(criterio);
                            setMostrarTodos(false);
                          }}
                          sx={{
                            minHeight: TOKENS_LAYOUT.alvoToque,
                            fontWeight: selecionado ? 600 : undefined,
                            bgcolor: selecionado ? "action.selected" : undefined,
                            borderColor: selecionado ? "primary.main" : undefined,
                          }}
                        >
                          {RANKINGS[criterio].botao}
                        </Botao>
                      );
                    })}
                  </Stack>
                  {ranking.length === 0 ? (
                    <Typography variant="body2" sx={{ color: "text.secondary", mt: 2 }}>
                      {RANKINGS[criterioRanking].vazio}
                    </Typography>
                  ) : (
                    <>
                      <Grid container component="ol" spacing={2} sx={{ mt: 0, p: 0 }}>
                        {(mostrarTodos ? ranking : ranking.slice(0, 10)).map((item, indice) => (
                          <Grid key={item.aluno.id} size={{ xs: 12, md: 6 }} component="li">
                            <Stack
                              direction="row"
                              spacing={2}
                              sx={{
                                alignItems: "center",
                                border: 1,
                                borderColor: "divider",
                                borderRadius: 1,
                                p: 2,
                                minWidth: 0,
                              }}
                            >
                              <Typography
                                aria-hidden="true"
                                variant="caption"
                                sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
                              >
                                {indice + 1}
                              </Typography>
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 500, overflowWrap: "anywhere" }}
                                >
                                  {item.aluno.nome}
                                </Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                  {turmas.find((turma) => turma.id === item.aluno.turmaId)?.rotulo}
                                </Typography>
                              </Box>
                              <Box sx={{ flexShrink: 0, textAlign: "right" }}>
                                <Typography
                                  component="strong"
                                  variant="body2"
                                  sx={{ display: "block", fontVariantNumeric: "tabular-nums" }}
                                >
                                  {item.quantidade}{" "}
                                  {RANKINGS[criterioRanking].unidade[item.quantidade === 1 ? 0 : 1]}
                                </Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                  {item.faltas} F · {item.justificadas} FJ
                                </Typography>
                              </Box>
                            </Stack>
                          </Grid>
                        ))}
                      </Grid>
                      {ranking.length > 10 ? (
                        <Botao
                          variante="texto"
                          sx={{ mt: 2, minHeight: TOKENS_LAYOUT.alvoToque }}
                          aria-expanded={mostrarTodos}
                          onClick={() => setMostrarTodos((atual) => !atual)}
                        >
                          {mostrarTodos ? "Mostrar 10 primeiros" : `Ver todos (${ranking.length})`}
                        </Botao>
                      ) : null}
                    </>
                  )}
                </Cartao>
              </Box>
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
