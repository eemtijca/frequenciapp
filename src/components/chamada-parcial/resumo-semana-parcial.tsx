"use client";

// Resumo semanal da Chamada Parcial, com os registros efetivos da tela.
// As seções recolhíveis e os cartões de dia vêm da base compartilhada em MUI.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { Feriado } from "@/domain/calendario-letivo";
import type { Aluno, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDataCurta, rotuloDiaSemana } from "@/domain/frequencia";
import type { RegistroPersonalizado } from "@/domain/frequencia-personalizada";
import { resumirSemanaParcial, type ResumoSemanaParcial } from "@/domain/resumo-semana-parcial";
import { pedir } from "@/lib/api-cliente";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Selo } from "@/components/ui/mui/selo";
import {
  CabecalhoResumo,
  CartaoDia,
  CorpoResumo,
  ResumoVazio,
  SecaoResumo,
} from "@/components/resumo-semanal/base";
import { useResumoSemanal } from "@/components/resumo-semanal/use-resumo-semanal";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";

interface Props {
  turma: Turma | null;
  alunos: Aluno[];
  dias: readonly string[];
  domingo?: string | null;
  feriados: readonly Feriado[];
  mostrarSaidas: boolean;
  versao?: number;
  ativa: boolean;
  pausado?: boolean;
  fuso: string;
  onAbrirDia: (dia: string) => void;
  onAbrirChamada?: (dia: string) => void;
}

interface DadosParciais {
  registros: RegistroPersonalizado[];
}

const LIMITE_ALUNOS = 5;

const VISUALMENTE_OCULTO = {
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

function RankingParcial({ resumo }: { resumo: ResumoSemanaParcial }) {
  const [completa, setCompleta] = useState(false);
  if (resumo.alunos.length === 0) return <ResumoVazio texto="Nenhum ajuste nesta semana." />;
  const visiveis = completa ? resumo.alunos : resumo.alunos.slice(0, LIMITE_ALUNOS);
  return (
    <Stack spacing={1.5}>
      <Table size="small" sx={{ tableLayout: "fixed" }}>
        <Typography component="caption" sx={VISUALMENTE_OCULTO}>
          Alunos com ajustes na Chamada Parcial
        </Typography>
        <TableHead>
          <TableRow>
            <TableCell scope="col" sx={{ py: 1, fontWeight: 500, color: "text.secondary" }}>
              Aluno
            </TableCell>
            <TableCell
              scope="col"
              align="right"
              sx={{ width: 64, py: 1, fontWeight: 500, color: "text.secondary" }}
            >
              Ajustes
            </TableCell>
            <TableCell
              scope="col"
              align="right"
              sx={{ width: 72, py: 1, fontWeight: 500, color: "text.secondary" }}
            >
              Pendentes
            </TableCell>
            <TableCell
              scope="col"
              align="right"
              sx={{ width: 72, py: 1, fontWeight: 500, color: "text.secondary" }}
            >
              Registrados
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visiveis.map((aluno) => (
            <TableRow key={aluno.alunoId}>
              <TableCell
                component="th"
                scope="row"
                sx={{ py: 1, fontWeight: 400, overflowWrap: "anywhere" }}
              >
                {aluno.nome}
              </TableCell>
              <TableCell align="right" sx={{ py: 1, fontVariantNumeric: "tabular-nums" }}>
                {aluno.ajustes}
              </TableCell>
              <TableCell
                align="right"
                sx={{ py: 1, color: "alerta.texto", fontVariantNumeric: "tabular-nums" }}
              >
                {aluno.pendentes}
              </TableCell>
              <TableCell
                align="right"
                sx={{ py: 1, color: "primary.main", fontVariantNumeric: "tabular-nums" }}
              >
                {aluno.registrados}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {resumo.alunos.length > LIMITE_ALUNOS ? (
        <Botao
          type="button"
          variante="texto"
          tamanho="pequeno"
          aria-expanded={completa}
          onClick={() => setCompleta((valor) => !valor)}
          sx={{ alignSelf: "flex-start", px: 0 }}
        >
          {completa ? "Mostrar menos" : "Ver a lista completa"}
        </Botao>
      ) : null}
    </Stack>
  );
}

function cartaoParcial(dia: ResumoSemanaParcial["dias"][number]) {
  if (dia.feriado) return { rotulo: "Feriado", tom: "neutro" as const };
  if (!dia.previsto && dia.registros === 0) return { rotulo: "Sem aula", tom: "neutro" as const };
  if (!dia.temChamada) return { rotulo: "Chamada pendente", tom: "pendente" as const };
  if (dia.pendentes > 0)
    return {
      rotulo: `${dia.pendentes} ${dia.pendentes === 1 ? "pendente" : "pendentes"}`,
      tom: "pendente" as const,
    };
  if (dia.registros > 0) return { rotulo: "Com ajustes", tom: "salva" as const };
  return { rotulo: "Sem registro", tom: "neutro" as const };
}

export function VistaResumoParcial({
  turma,
  alunos,
  dias,
  domingo,
  feriados,
  mostrarSaidas,
  versao = 0,
  ativa,
  pausado = false,
  fuso,
  onAbrirDia,
  onAbrirChamada,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const turmaId = turma?.id ?? "";
  const periodo = `${de}|${ate}|${turmaId}`;
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ visao: true });
  const periodoAnterior = useRef(periodo);

  useEffect(() => {
    if (periodoAnterior.current === periodo) return;
    periodoAnterior.current = periodo;
    setAbertas({ visao: true });
  }, [periodo]);

  const carregar = useCallback(
    async (sinal: AbortSignal) => {
      if (!turmaId) return { dados: { registros: [] }, assinatura: "sem-turma" };
      const dados = await pedir<{ registros: RegistroPersonalizado[] }>(
        `/api/frequencias-personalizadas?de=${de}&ate=${ate}&turmaId=${encodeURIComponent(turmaId)}`,
        { signal: sinal },
      );
      return {
        dados: { registros: dados.registros },
        assinatura: JSON.stringify(dados.registros),
      };
    },
    [ate, de, turmaId],
  );

  const carga = useResumoSemanal<DadosParciais>({
    periodo,
    versao,
    ativo: ativa,
    pausado,
    viewId: "chamada-parcial",
    fuso,
    carregar,
  });

  const resumo = useMemo(
    () =>
      carga.dados && turma
        ? resumirSemanaParcial(turma, alunos, dias, carga.dados.registros, feriados)
        : null,
    [alunos, carga.dados, dias, feriados, turma],
  );

  const saidas = useMemo(
    () =>
      mostrarSaidas
        ? (carga.dados?.registros ?? [])
            .filter((registro) => registro.tipo === "SAIDA")
            .sort((a, b) => a.dia.localeCompare(b.dia) || a.alunoNome.localeCompare(b.alunoNome))
        : [],
    [carga.dados, mostrarSaidas],
  );

  function aberta(chave: string) {
    return abertas[chave] ?? false;
  }
  function alternar(chave: string, valor: boolean) {
    setAbertas((atual) => ({ ...atual, [chave]: valor }));
  }

  return (
    <Paper
      component="section"
      aria-label="Resumo da semana"
      aria-busy={!carga.dados}
      variant="outlined"
      elevation={0}
      sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <CabecalhoResumo
        dias={dias}
        domingo={domingo}
        atualizadoEm={carga.atualizadoEm}
        fuso={fuso}
        descricao="Registros efetivos da Chamada Parcial da turma selecionada."
      />
      <CorpoResumo>
        <Typography component="p" role="status" aria-live="polite" sx={VISUALMENTE_OCULTO}>
          {!carga.dados && !carga.erro ? "Carregando resumo da semana..." : carga.anuncio}
        </Typography>
        {carga.erro && carga.dados ? (
          <AlertaCompacto
            variante="indisponivel"
            descricao={carga.erro}
            tamanho="linha"
            acao={{ rotulo: "Tentar novamente", onClick: carga.tentarNovamente }}
          />
        ) : null}
        {!carga.dados && !carga.erro ? (
          <Stack spacing={1} sx={{ py: 4 }}>
            <Skeleton variant="rounded" height={96} />
            <Skeleton variant="rounded" height={160} />
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
        {!turma ? <ResumoVazio texto="Nenhuma turma selecionada." /> : null}

        {resumo ? (
          <Box
            component="article"
            aria-labelledby={`resumo-parcial-${resumo.turmaId}`}
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography
                id={`resumo-parcial-${resumo.turmaId}`}
                component="h3"
                variant="subtitle1"
                sx={{ fontWeight: 600 }}
              >
                {resumo.rotulo}
              </Typography>
              <Selo
                component="span"
                tom={resumo.totais.pendentes === 0 ? "sucesso" : "atencao"}
                tamanho="pequeno"
                rotulo={
                  <Box
                    component="span"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                  >
                    {resumo.totais.pendentes === 0 ? (
                      <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                    ) : (
                      <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                    )}
                    <span>
                      {resumo.totais.pendentes === 0
                        ? "Sem pendências"
                        : `${resumo.totais.pendentes} ${resumo.totais.pendentes === 1 ? "pendência" : "pendências"}`}
                    </span>
                  </Box>
                }
              />
            </Stack>

            <SecaoResumo
              id="parcial-visao"
              titulo="Visão geral"
              descricao="Situação na Seduc, tipos de registro e dias da semana."
              icone={CalendarMonthRoundedIcon}
              aberto={aberta("visao")}
              onAbertoChange={(valor) => alternar("visao", valor)}
              resumo={
                <>
                  <Selo rotulo={`${resumo.totais.ajustes} ajustes`} tom="neutro" component="span" />
                  <Selo
                    rotulo={`${resumo.totais.pendentes} pendentes`}
                    tom="neutro"
                    component="span"
                  />
                </>
              }
            >
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" },
                }}
              >
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                    Situação na Seduc
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      mt: 1,
                      "& > *:not(:first-of-type)": { borderLeft: 1, borderColor: "divider" },
                    }}
                  >
                    {[
                      ["Ajustes", resumo.totais.ajustes],
                      ["Pendentes", resumo.totais.pendentes],
                      ["Registrados", resumo.totais.registrados],
                    ].map(([rotulo, valor]) => (
                      <Stack key={rotulo} spacing={0.25} sx={{ alignItems: "center", px: 1 }}>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {rotulo}
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                        >
                          {valor}
                        </Typography>
                      </Stack>
                    ))}
                  </Box>
                </Box>
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                    Tipos de registro
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      mt: 1,
                      "& > *:not(:first-of-type)": { borderLeft: 1, borderColor: "divider" },
                    }}
                  >
                    {[
                      ["Parciais", resumo.totais.presencasParciais],
                      ["Justificativas", resumo.totais.justificadas],
                      ["Saídas", resumo.totais.saidas],
                    ].map(([rotulo, valor]) => (
                      <Stack key={rotulo} spacing={0.25} sx={{ alignItems: "center", px: 1 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", textAlign: "center" }}
                        >
                          {rotulo}
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                        >
                          {valor}
                        </Typography>
                      </Stack>
                    ))}
                  </Box>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Ajustes incluem chamadas com saída parcial ou justificativa, saídas e
                personalizações.
              </Typography>
              <GraficoRosca
                titulo="Situação dos ajustes na Seduc"
                fatias={[
                  { nome: "Pendentes", valor: resumo.totais.pendentes },
                  { nome: "Registrados", valor: resumo.totais.registrados },
                ]}
                rotuloTotal="ajustes"
                unidadeSingular="ajuste"
                unidadePlural="ajustes"
                vazio="Nenhum ajuste nesta semana"
              />
              <Box
                component="ul"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 7rem), 1fr))",
                  gap: 1,
                  listStyle: "none",
                  m: 0,
                  p: 0,
                }}
              >
                {resumo.dias.map((dia) => {
                  const situacao = cartaoParcial(dia);
                  return (
                    <CartaoDia
                      key={dia.dia}
                      dia={dia.dia}
                      rotulo={rotuloDiaSemana(dia.dia).replace("-feira", "").slice(0, 3)}
                      status={situacao.rotulo}
                      tom={situacao.tom}
                      abrir={Boolean(dia.previsto || dia.registros > 0)}
                      onAbrir={() => onAbrirDia(dia.dia)}
                      ariaLabel={
                        dia.previsto || dia.registros > 0
                          ? `Abrir ${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                          : `${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                      }
                      contagens={
                        dia.registros > 0 ? (
                          <Box
                            sx={{
                              display: "flex",
                              width: "100%",
                              flexDirection: "column",
                              gap: 0.75,
                            }}
                          >
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {dia.registros} {dia.registros === 1 ? "registro" : "registros"}
                            </Typography>
                            <Box
                              aria-hidden="true"
                              sx={{ display: "flex", width: "100%", gap: 0.5 }}
                            >
                              {dia.ajustes > 0 ? (
                                <Box
                                  sx={{
                                    height: 4,
                                    flexGrow: dia.ajustes,
                                    borderRadius: "999px",
                                    backgroundColor: "primary.main",
                                  }}
                                />
                              ) : null}
                              {dia.pendentes > 0 ? (
                                <Box
                                  sx={{
                                    height: 4,
                                    flexGrow: dia.pendentes,
                                    borderRadius: "999px",
                                    backgroundColor: "alerta.main",
                                  }}
                                />
                              ) : null}
                            </Box>
                          </Box>
                        ) : undefined
                      }
                      detalhe={
                        dia.semRegistro > 0
                          ? `${dia.semRegistro} ${dia.semRegistro === 1 ? "aluno sem registro" : "alunos sem registro"}`
                          : undefined
                      }
                    />
                  );
                })}
              </Box>
            </SecaoResumo>

            <SecaoResumo
              id="parcial-pendencias"
              titulo="Pendentes na Seduc"
              descricao="Registros que exigem conferência e ainda não foram confirmados."
              icone={AssignmentRoundedIcon}
              aberto={aberta("pendencias")}
              onAbertoChange={(valor) => alternar("pendencias", valor)}
              resumo={
                <Selo
                  rotulo={`${resumo.pendenciasSeduc.length} pendentes`}
                  tom="neutro"
                  component="span"
                />
              }
            >
              {resumo.pendenciasSeduc.length === 0 ? (
                <ResumoVazio texto="Nenhuma pendência na Seduc nesta semana." />
              ) : (
                <List disablePadding>
                  {resumo.pendenciasSeduc.map((item) => (
                    <ListItem
                      key={item.id}
                      divider
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        px: 0,
                        py: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, overflowWrap: "anywhere" }}
                        >
                          {item.alunoNome}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {rotuloData(item.dia)} · {item.tipo}
                        </Typography>
                      </Box>
                      <Botao
                        type="button"
                        variante="contorno"
                        tamanho="pequeno"
                        onClick={() => onAbrirDia(item.dia)}
                      >
                        Abrir {rotuloDataCurta(item.dia)}
                      </Botao>
                    </ListItem>
                  ))}
                </List>
              )}
            </SecaoResumo>

            <SecaoResumo
              id="parcial-sem-chamada"
              titulo="Dias sem chamada"
              descricao="Dias letivos sem a chamada regular salva."
              icone={WarningAmberRoundedIcon}
              aberto={aberta("sem-chamada")}
              onAbertoChange={(valor) => alternar("sem-chamada", valor)}
              resumo={
                <Selo
                  rotulo={`${resumo.diasSemChamada.length} dias`}
                  tom="neutro"
                  component="span"
                />
              }
            >
              {resumo.diasSemChamada.length === 0 ? (
                <ResumoVazio texto="Nenhum dia letivo sem chamada nesta semana." />
              ) : (
                <List disablePadding>
                  {resumo.diasSemChamada.map((dia) => (
                    <ListItem
                      key={dia}
                      divider
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        px: 0,
                        py: 1,
                      }}
                    >
                      <Typography variant="body2">
                        {rotuloDiaSemana(dia).replace("-feira", "")}, {rotuloData(dia)}
                      </Typography>
                      {onAbrirChamada ? (
                        <Botao
                          type="button"
                          variante="contorno"
                          tamanho="pequeno"
                          onClick={() => onAbrirChamada(dia)}
                        >
                          Abrir na Chamada
                        </Botao>
                      ) : (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          A chamada regular é registrada na tela Chamada.
                        </Typography>
                      )}
                    </ListItem>
                  ))}
                </List>
              )}
            </SecaoResumo>

            <SecaoResumo
              id="parcial-alunos"
              titulo="Alunos"
              descricao="Ajustes, pendentes e registrados por aluno."
              icone={GroupsRoundedIcon}
              aberto={aberta("alunos")}
              onAbertoChange={(valor) => alternar("alunos", valor)}
              resumo={
                <Selo rotulo={`${resumo.alunos.length} alunos`} tom="neutro" component="span" />
              }
            >
              <RankingParcial resumo={resumo} />
            </SecaoResumo>

            {mostrarSaidas ? (
              <SecaoResumo
                id="parcial-saidas"
                titulo="Saídas"
                descricao="Saídas antecipadas da semana."
                icone={ScheduleRoundedIcon}
                aberto={aberta("saidas")}
                onAbertoChange={(valor) => alternar("saidas", valor)}
                resumo={<Selo rotulo={`${saidas.length} saídas`} tom="neutro" component="span" />}
              >
                {saidas.length === 0 ? (
                  <ResumoVazio texto="Nenhuma saída antecipada nesta semana." />
                ) : (
                  <List disablePadding>
                    {saidas.map((saida) => (
                      <ListItem key={saida.id} divider sx={{ px: 0, py: 1 }}>
                        <Typography variant="body2">
                          <Box component="span" sx={{ fontWeight: 500 }}>
                            {saida.alunoNome}
                          </Box>
                          <Box component="span" sx={{ color: "text.secondary" }}>
                            {` · ${rotuloData(saida.dia)} · ${saida.horario ?? ""}`}
                          </Box>
                        </Typography>
                      </ListItem>
                    ))}
                  </List>
                )}
              </SecaoResumo>
            ) : null}
          </Box>
        ) : null}
      </CorpoResumo>
    </Paper>
  );
}
