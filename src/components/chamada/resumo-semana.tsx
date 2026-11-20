"use client";

// Resumo semanal de frequência, com seções recolhíveis e atualização silenciosa.
import { useCallback, useMemo, useState } from "react";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
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
import type { Aluno, Configuracoes, Frequencia, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDataCurta, rotuloDiaSemana, rotuloMomento } from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import {
  exigeConferenciaSeduc,
  rotuloFrequenciaPersonalizada,
  type RegistroPersonalizado,
} from "@/domain/frequencia-personalizada";
import { limiaresDoPainel } from "@/domain/relatorios";
import { resumirSemanaDaTurma, type ResumoSemanaTurma } from "@/domain/resumo-semana";
import { pedir } from "@/lib/api-cliente";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { BarraProgresso } from "@/components/ui/mui/barra-progresso";
import { Botao } from "@/components/ui/mui/botao";
import { CirculosAcumulado } from "@/components/ui/mui/circulo-contagem";
import { Selo } from "@/components/ui/mui/selo";
import {
  CabecalhoResumo,
  CartaoDia,
  CorpoResumo,
  ResumoVazio,
  SecaoResumo,
} from "@/components/resumo-semanal/base";
import { useResumoSemanal } from "@/components/resumo-semanal/use-resumo-semanal";
import { GraficoEvolucao, GraficoRosca } from "@/components/graficos/graficos-sob-demanda";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  dias: readonly string[];
  domingo?: string | null;
  feriados: readonly Feriado[];
  configuracoes: Configuracoes;
  mostrarSaidas: boolean;
  versao?: number;
  contexto?: "painel" | "chamada";
  ativo?: boolean;
  pausado?: boolean;
  viewId?: string;
  fuso: string;
  onRecarregarConfiguracoes?: () => Promise<void>;
  onAbrirDia: (dia: string) => void;
}

interface DadosSemana {
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  entradas: EntradaAtrasada[];
  parciais: RegistroPersonalizado[];
  avisoSaidas: string;
  avisoEntradas: string;
  avisoParciais: string;
}

const LIMITE_ALUNOS = 5;
const LIMITE_MOVIMENTACOES = 8;

const VISUALMENTE_OCULTO = {
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

function horarioDoDia(dia: { feriado: string | null; salva: boolean; previsto: boolean }): {
  rotulo: string;
  tom: "salva" | "pendente" | "neutro";
} {
  if (dia.feriado) return { rotulo: "Feriado", tom: "neutro" };
  if (dia.salva) return { rotulo: "Chamada salva", tom: "salva" };
  if (dia.previsto) return { rotulo: "Chamada pendente", tom: "pendente" };
  return { rotulo: "Sem aula", tom: "neutro" };
}

function rotuloCurtoDoDia(dia: string): string {
  return rotuloDiaSemana(dia).replace("-feira", "").slice(0, 3);
}

function RankingAlunos({ resumo }: { resumo: ResumoSemanaTurma }) {
  const [listaCompleta, setListaCompleta] = useState(false);
  if (resumo.alunos.length === 0) return <ResumoVazio texto="Nenhuma falta nesta semana." />;
  const visiveis = listaCompleta ? resumo.alunos : resumo.alunos.slice(0, LIMITE_ALUNOS);
  return (
    <Stack spacing={1.5}>
      <Table size="small" sx={{ tableLayout: "fixed", textAlign: "left" }}>
        <Typography component="caption" sx={VISUALMENTE_OCULTO}>
          Alunos com mais faltas na semana
        </Typography>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 32, py: 1, fontWeight: 500, color: "text.secondary" }}>
              #
            </TableCell>
            <TableCell sx={{ py: 1, fontWeight: 500, color: "text.secondary" }}>Aluno</TableCell>
            <TableCell
              align="right"
              sx={{ width: 36, py: 1, fontWeight: 500, color: "text.secondary" }}
            >
              F
            </TableCell>
            <TableCell
              align="right"
              sx={{ width: 40, py: 1, fontWeight: 500, color: "text.secondary" }}
            >
              FJ
            </TableCell>
            <TableCell
              align="right"
              sx={{ width: 48, py: 1, fontWeight: 500, color: "text.secondary" }}
            >
              Total
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visiveis.map((aluno, indice) => (
            <TableRow key={aluno.alunoId}>
              <TableCell
                sx={{ py: 1, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
              >
                {indice + 1}
              </TableCell>
              <TableCell
                component="th"
                scope="row"
                sx={{ py: 1, fontWeight: 400, overflowWrap: "anywhere" }}
              >
                {aluno.nome}
              </TableCell>
              <TableCell
                align="right"
                sx={{ py: 1, color: "falta.texto", fontVariantNumeric: "tabular-nums" }}
              >
                {aluno.faltas}
              </TableCell>
              <TableCell
                align="right"
                sx={{ py: 1, color: "justificada.texto", fontVariantNumeric: "tabular-nums" }}
              >
                {aluno.justificadas}
              </TableCell>
              <TableCell
                align="right"
                sx={{ py: 1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              >
                {aluno.faltas + aluno.justificadas}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        F: falta. FJ: falta justificada.
      </Typography>
      {resumo.alunos.length > LIMITE_ALUNOS ? (
        <Botao
          variante="texto"
          tamanho="pequeno"
          aria-expanded={listaCompleta}
          onClick={() => setListaCompleta((valor) => !valor)}
          sx={{ alignSelf: "flex-start", px: 0 }}
        >
          {listaCompleta ? "Mostrar menos" : "Ver a lista completa"}
        </Botao>
      ) : null}
    </Stack>
  );
}

function ListaMovimentacoes({
  itens,
}: {
  itens: {
    id: string;
    tipo: "Saída" | "Entrada";
    nome: string;
    turma: string;
    dia: string;
    horario: string | null;
    momento: string;
  }[];
}) {
  const [completa, setCompleta] = useState(false);
  if (itens.length === 0) return <ResumoVazio texto="Nenhuma movimentação nesta semana." />;
  const visiveis = completa ? itens : itens.slice(0, LIMITE_MOVIMENTACOES);
  return (
    <Stack spacing={1.5}>
      <List disablePadding>
        {visiveis.map((item) => (
          <ListItem
            key={item.id}
            divider
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 1,
              px: 0,
              py: 1,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>
                {item.nome}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {item.turma} · {rotuloData(item.dia)} · {item.momento}
                {item.horario ? ` · ${item.horario}` : ""}
              </Typography>
            </Box>
            <Selo rotulo={item.tipo} tom="neutro" tamanho="pequeno" />
          </ListItem>
        ))}
      </List>
      {itens.length > LIMITE_MOVIMENTACOES ? (
        <Botao
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

export function VistaResumoSemana({
  turmas,
  alunos,
  dias,
  domingo,
  feriados,
  configuracoes,
  mostrarSaidas,
  versao = 0,
  contexto = "chamada",
  ativo = true,
  pausado = false,
  viewId = contexto === "painel" ? "painel" : "chamada",
  fuso,
  onRecarregarConfiguracoes,
  onAbrirDia,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const turmasChave = useMemo(() => turmas.map((turma) => turma.id).join(","), [turmas]);
  const periodo = `${de}|${ate}|${turmasChave}|${contexto}|${mostrarSaidas ? 1 : 0}`;
  const painel = contexto === "painel";

  const carregar = useCallback(
    async (sinal: AbortSignal) => {
      const configuracao = onRecarregarConfiguracoes
        ? onRecarregarConfiguracoes().catch(() => undefined)
        : Promise.resolve(undefined);
      const [frequenciasResultado, saidasResultado, entradasResultado, parciaisResultado] =
        await Promise.allSettled([
          pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?de=${de}&ate=${ate}`, {
            signal: sinal,
          }),
          mostrarSaidas
            ? pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?de=${de}&ate=${ate}`, {
                signal: sinal,
              })
            : Promise.resolve({ saidas: [] as SaidaAntecipada[] }),
          painel && mostrarSaidas
            ? pedir<{ entradas: EntradaAtrasada[] }>(`/api/entradas?de=${de}&ate=${ate}`, {
                signal: sinal,
              })
            : Promise.resolve({ entradas: [] as EntradaAtrasada[] }),
          painel
            ? pedir<{ registros: RegistroPersonalizado[] }>(
                `/api/frequencias-personalizadas?de=${de}&ate=${ate}`,
                { signal: sinal },
              )
            : Promise.resolve({ registros: [] as RegistroPersonalizado[] }),
        ]);
      await configuracao;
      if (frequenciasResultado.status === "rejected") {
        throw frequenciasResultado.reason;
      }
      const saidas = saidasResultado.status === "fulfilled" ? saidasResultado.value.saidas : [];
      const entradas =
        entradasResultado.status === "fulfilled" ? entradasResultado.value.entradas : [];
      const parciais =
        parciaisResultado.status === "fulfilled" ? parciaisResultado.value.registros : [];
      const idsVisiveis = new Set(turmas.map((turma) => turma.id));
      const dados: DadosSemana = {
        frequencias: frequenciasResultado.value.frequencias,
        saidas: saidas.filter(
          (saida) => !saida.turmaHistoricaId || idsVisiveis.has(saida.turmaHistoricaId),
        ),
        entradas: entradas.filter((entrada) => idsVisiveis.has(entrada.turmaId)),
        parciais: parciais.filter(
          (registro) => registro.turmaId !== null && idsVisiveis.has(registro.turmaId),
        ),
        avisoSaidas:
          mostrarSaidas && saidasResultado.status === "rejected"
            ? "Não foi possível carregar as saídas."
            : "",
        avisoEntradas:
          painel && mostrarSaidas && entradasResultado.status === "rejected"
            ? "Não foi possível carregar as entradas."
            : "",
        avisoParciais:
          painel && parciaisResultado.status === "rejected"
            ? "Não foi possível carregar as pendências da Seduc."
            : "",
      };
      return { dados, assinatura: JSON.stringify(dados) };
    },
    [ate, de, mostrarSaidas, onRecarregarConfiguracoes, painel, turmas],
  );

  const resumo = useResumoSemanal<DadosSemana>({
    periodo,
    versao,
    ativo,
    pausado,
    viewId,
    fuso,
    carregar,
  });

  const dados = resumo.dados;
  const pronto = dados !== null;
  const resumos = useMemo(
    () =>
      dados
        ? turmas.map((turma) =>
            resumirSemanaDaTurma(
              turma,
              alunos,
              dias,
              dados.frequencias,
              painel ? [] : dados.saidas,
              feriados,
            ),
          )
        : [],
    [alunos, dados, dias, feriados, painel, turmas],
  );

  const chavesPadrao = useMemo(() => {
    const chaves: Record<string, boolean> = {};
    for (const turma of turmas) {
      chaves[`${turma.id}:visao`] = true;
      chaves[`${turma.id}:pendencias`] = false;
      chaves[`${turma.id}:alunos`] = false;
      chaves[`${turma.id}:saidas`] = false;
    }
    chaves.movimentacoes = false;
    chaves.pendenciasSeduc = false;
    return chaves;
  }, [turmas]);
  const [secoes, setSecoes] = useState<Record<string, boolean>>(chavesPadrao);
  const [chavesAtuais, setChavesAtuais] = useState(chavesPadrao);
  const [periodoSecoes, setPeriodoSecoes] = useState(periodo);
  if (chavesAtuais !== chavesPadrao || periodoSecoes !== periodo) {
    setChavesAtuais(chavesPadrao);
    setPeriodoSecoes(periodo);
    setSecoes(chavesPadrao);
  }

  function aberta(chave: string): boolean {
    return secoes[chave] ?? chavesPadrao[chave] ?? false;
  }
  function alternar(chave: string, valor: boolean) {
    setSecoes((atual) => ({ ...atual, [chave]: valor }));
  }

  const movimentacoes = useMemo(() => {
    if (!dados || !mostrarSaidas) return [];
    const alunosPorId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
    const lista = [
      ...dados.saidas.flatMap((saida) => {
        const aluno = alunosPorId.get(saida.alunoId);
        if (!aluno) return [];
        return [
          {
            id: `saida:${saida.id}`,
            tipo: "Saída" as const,
            nome: aluno.nome,
            turma: saida.turmaHistoricaNome ?? "Turma histórica desconhecida",
            dia: saida.dia,
            horario: saida.horario,
            momento: rotuloMomento(saida.momento),
          },
        ];
      }),
      ...dados.entradas.map((entrada) => ({
        id: `entrada:${entrada.id}`,
        tipo: "Entrada" as const,
        nome: entrada.nome,
        turma: entrada.turmaRotulo,
        dia: entrada.dia,
        horario: entrada.horario,
        momento: entrada.momento ? rotuloMomento(entrada.momento) : "Entrada",
      })),
    ];
    return lista.sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        (a.horario ?? "").localeCompare(b.horario ?? "") ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [alunos, dados, mostrarSaidas]);

  const movimentacoesPorDia = useMemo(
    () =>
      dias.map((dia) => ({
        dia,
        total: movimentacoes.filter((movimento) => movimento.dia === dia).length,
      })),
    [dias, movimentacoes],
  );

  const pendenciasSeduc = useMemo(() => {
    if (!dados) return [];
    return dados.parciais
      .filter((registro) => exigeConferenciaSeduc(registro) && !registro.registradoSeduc)
      .map((registro) => ({
        id: registro.id,
        nome: registro.alunoNome,
        turma: registro.turmaNome,
        dia: registro.dia,
        tipo: rotuloFrequenciaPersonalizada(registro),
      }))
      .sort(
        (a, b) =>
          a.dia.localeCompare(b.dia) ||
          a.turma.localeCompare(b.turma, "pt-BR") ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [dados]);

  const avisos = [dados?.avisoSaidas, dados?.avisoEntradas, dados?.avisoParciais].filter(
    (aviso): aviso is string => Boolean(aviso),
  );

  return (
    <Paper
      component="section"
      aria-label="Resumo da semana"
      aria-busy={!pronto}
      variant="outlined"
      elevation={0}
      sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <CabecalhoResumo
        dias={dias}
        domingo={domingo}
        atualizadoEm={resumo.atualizadoEm}
        fuso={fuso}
        descricao={
          painel
            ? "Frequência, movimentações e pendências da Seduc de todas as turmas visíveis."
            : "Frequência e saídas da turma selecionada."
        }
      />
      <CorpoResumo>
        <Typography component="p" role="status" aria-live="polite" sx={VISUALMENTE_OCULTO}>
          {resumo.anuncio}
        </Typography>
        {resumo.erro && pronto ? (
          <AlertaCompacto
            variante="indisponivel"
            descricao={resumo.erro}
            tamanho="linha"
            acao={{ rotulo: "Tentar novamente", onClick: resumo.tentarNovamente }}
          />
        ) : null}
        {avisos.length > 0 ? (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Alguns dados não puderam ser carregados. As seções afetadas mostram o aviso.
          </Typography>
        ) : null}
        {!pronto && !resumo.erro ? (
          <Stack spacing={1} sx={{ py: 4 }}>
            <Typography
              component="p"
              role="status"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center" }}
            >
              Carregando resumo da semana...
            </Typography>
            <Skeleton variant="rounded" height={96} />
            <Skeleton variant="rounded" height={160} />
          </Stack>
        ) : null}
        {!pronto && resumo.erro ? (
          <AlertaCompacto
            variante="indisponivel"
            descricao={resumo.erro}
            tamanho="linha"
            acao={{ rotulo: "Tentar novamente", onClick: resumo.tentarNovamente }}
          />
        ) : null}
        {pronto && turmas.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nenhuma turma disponível para o resumo.
          </Typography>
        ) : null}

        {resumos.map((item) => {
          const totalPendencias = item.pendencias.length;
          const totalMarcas = item.totais.faltas + item.totais.justificadas + item.totais.presentes;
          const evolucao = item.dias.map((dia) => {
            const registrados = dia.faltas + dia.justificadas + dia.presentes + dia.parciais;
            return {
              rotulo: rotuloDataCurta(dia.dia),
              valor:
                registrados > 0
                  ? Math.round(((dia.faltas + dia.justificadas) / registrados) * 1000) / 10
                  : null,
            };
          });
          return (
            <Box
              component="article"
              key={item.turmaId}
              aria-labelledby={`resumo-turma-${item.turmaId}`}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Box>
                  <Typography
                    id={`resumo-turma-${item.turmaId}`}
                    component="h3"
                    variant="subtitle1"
                    sx={{ fontWeight: 600 }}
                  >
                    {item.rotulo}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {dias[0] ? `${rotuloDataCurta(dias[0])} a ${rotuloDataCurta(ate)}` : ""}
                  </Typography>
                </Box>
                <Selo
                  tom={totalPendencias === 0 ? "sucesso" : "atencao"}
                  tamanho="pequeno"
                  rotulo={
                    <Box
                      component="span"
                      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                    >
                      {totalPendencias === 0 ? (
                        <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                      ) : (
                        <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                      )}
                      <span>
                        {totalPendencias === 0
                          ? "Sem pendências"
                          : `${totalPendencias} ${totalPendencias === 1 ? "pendência" : "pendências"}`}
                      </span>
                    </Box>
                  }
                />
              </Box>

              <SecaoResumo
                id={`${item.turmaId}-visao`}
                titulo="Visão geral"
                descricao="Totais, evolução e dias da semana."
                icone={CalendarMonthRoundedIcon}
                aberto={aberta(`${item.turmaId}:visao`)}
                onAbertoChange={(valor) => alternar(`${item.turmaId}:visao`, valor)}
                resumo={
                  <>
                    <Selo component="span" rotulo={`${item.totais.faltas} faltas`} tom="neutro" />
                    <Selo
                      component="span"
                      rotulo={`${item.totais.justificadas} justificadas`}
                      tom="neutro"
                    />
                    <Selo
                      component="span"
                      rotulo={`${item.totais.presentes} presentes`}
                      tom="neutro"
                    />
                  </>
                }
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 2,
                    backgroundColor: "background.paper",
                  }}
                >
                  {(
                    [
                      ["Faltas", item.totais.faltas, "falta.texto"],
                      ["Justificadas", item.totais.justificadas, "justificada.texto"],
                      ["Presentes", item.totais.presentes, "primary.main"],
                    ] as const
                  ).map(([rotulo, valor, cor], indice) => (
                    <Stack
                      key={rotulo}
                      spacing={0.25}
                      sx={{
                        alignItems: "center",
                        px: 1,
                        py: 1.5,
                        ...(indice > 0 ? { borderLeft: 1, borderColor: "divider" } : {}),
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", fontWeight: 500 }}
                      >
                        {rotulo}
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: cor }}
                      >
                        {valor}
                      </Typography>
                    </Stack>
                  ))}
                </Box>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Somente chamadas salvas.
                </Typography>
                {(() => {
                  const previstos = item.dias.filter((dia) => dia.previsto).length;
                  const salvos = item.dias.filter((dia) => dia.previsto && dia.salva).length;
                  const cobertura = previstos > 0 ? Math.round((salvos / previstos) * 100) : 100;
                  return (
                    <Stack spacing={0.5}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", justifyContent: "space-between" }}
                      >
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Cobertura da semana
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                        >
                          {salvos} de {previstos} dias com chamada
                        </Typography>
                      </Stack>
                      <BarraProgresso
                        valor={cobertura}
                        rotulo="Cobertura de chamadas da semana"
                        descricao={`${salvos} de ${previstos} dias com chamada`}
                      />
                    </Stack>
                  );
                })()}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
                    gap: 2,
                  }}
                >
                  <GraficoRosca
                    tomValores="falta"
                    titulo={`Faltas, justificadas e presentes de ${item.rotulo}: ${totalMarcas} ${totalMarcas === 1 ? "registro" : "registros"} (F + FJ + P)`}
                    rotuloTotal="F + FJ + P"
                    fatias={[
                      { nome: "Faltas", valor: item.totais.faltas },
                      {
                        nome: "Justificadas",
                        valor: item.totais.justificadas,
                        unidadeSingular: "falta justificada",
                        unidadePlural: "faltas justificadas",
                      },
                      {
                        nome: "Presentes",
                        valor: item.totais.presentes,
                        unidadeSingular: "presença",
                        unidadePlural: "presenças",
                      },
                    ]}
                    vazio={
                      item.chamadasSalvas.length > 0
                        ? "Nenhum registro F, FJ ou P nesta semana"
                        : "Nenhuma chamada salva nesta semana"
                    }
                  />
                  <GraficoEvolucao
                    evolucao={evolucao}
                    limiares={limiaresDoPainel(configuracoes)}
                    rotuloAcessivel={`Infrequência diária de ${item.rotulo}. Os valores também aparecem nos cartões de dia.`}
                  />
                </Box>
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
                  {item.dias.map((dia) => {
                    const situacao = horarioDoDia(dia);
                    const abre = Boolean(dia.salva || dia.previsto);
                    const detalhe = [
                      dia.feriado ? `Feriado: ${dia.feriado}` : "",
                      dia.parciais > 0
                        ? `${dia.parciais} ${dia.parciais === 1 ? "presença parcial" : "presenças parciais"}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(". ");
                    return (
                      <CartaoDia
                        key={dia.dia}
                        dia={dia.dia}
                        rotulo={rotuloCurtoDoDia(dia.dia)}
                        status={situacao.rotulo}
                        tom={situacao.tom}
                        abrir={abre}
                        onAbrir={() => onAbrirDia(dia.dia)}
                        ariaLabel={
                          abre
                            ? `Abrir ${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                            : `${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                        }
                        contagens={
                          dia.salva ? (
                            <Stack spacing={0.75} sx={{ width: "100%" }}>
                              <CirculosAcumulado
                                faltas={dia.faltas}
                                justificadas={dia.justificadas}
                                saidas={
                                  mostrarSaidas && !painel && dia.saidas > 0
                                    ? dia.saidas
                                    : undefined
                                }
                              />
                              <Box
                                aria-hidden="true"
                                sx={{ display: "flex", width: "100%", gap: 0.5 }}
                              >
                                {dia.faltas > 0 ? (
                                  <Box
                                    sx={{
                                      height: 4,
                                      flexGrow: dia.faltas,
                                      borderRadius: "999px",
                                      backgroundColor: "falta.main",
                                    }}
                                  />
                                ) : null}
                                {dia.justificadas > 0 ? (
                                  <Box
                                    sx={{
                                      height: 4,
                                      flexGrow: dia.justificadas,
                                      borderRadius: "999px",
                                      backgroundColor: "justificada.main",
                                    }}
                                  />
                                ) : null}
                                {dia.presentes > 0 ? (
                                  <Box
                                    sx={{
                                      height: 4,
                                      flexGrow: dia.presentes,
                                      borderRadius: "999px",
                                      backgroundColor: "primary.main",
                                    }}
                                  />
                                ) : null}
                              </Box>
                            </Stack>
                          ) : undefined
                        }
                        detalhe={detalhe || undefined}
                      />
                    );
                  })}
                </Box>
              </SecaoResumo>

              <SecaoResumo
                id={`${item.turmaId}-pendencias`}
                titulo="Pendências"
                descricao="Dias letivos sem chamada nesta semana."
                icone={WarningAmberRoundedIcon}
                aberto={aberta(`${item.turmaId}:pendencias`)}
                onAbertoChange={(valor) => alternar(`${item.turmaId}:pendencias`, valor)}
                resumo={
                  <Selo
                    rotulo={`${totalPendencias} ${totalPendencias === 1 ? "dia" : "dias"}`}
                    tom={totalPendencias === 0 ? "sucesso" : "atencao"}
                    component="span"
                  />
                }
              >
                {item.pendencias.length === 0 ? (
                  <ResumoVazio texto="Nenhuma pendência nesta semana." />
                ) : (
                  <List disablePadding>
                    {item.pendencias.map((dia) => (
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
                        <Botao
                          variante="contorno"
                          tamanho="pequeno"
                          onClick={() => onAbrirDia(dia)}
                        >
                          Abrir {rotuloDataCurta(dia)}
                        </Botao>
                      </ListItem>
                    ))}
                  </List>
                )}
              </SecaoResumo>

              <SecaoResumo
                id={`${item.turmaId}-alunos`}
                titulo="Alunos"
                descricao="Ranking de faltas e faltas justificadas."
                icone={AssignmentRoundedIcon}
                aberto={aberta(`${item.turmaId}:alunos`)}
                onAbertoChange={(valor) => alternar(`${item.turmaId}:alunos`, valor)}
                resumo={
                  <Selo component="span" rotulo={`${item.alunos.length} alunos`} tom="neutro" />
                }
              >
                <RankingAlunos resumo={item} />
              </SecaoResumo>

              {!painel && mostrarSaidas ? (
                <SecaoResumo
                  id={`${item.turmaId}-saidas`}
                  titulo="Saídas"
                  descricao="Saídas antecipadas da semana."
                  icone={ScheduleRoundedIcon}
                  aberto={aberta(`${item.turmaId}:saidas`)}
                  onAbertoChange={(valor) => alternar(`${item.turmaId}:saidas`, valor)}
                  resumo={
                    <Selo component="span" rotulo={`${item.saidas.length} saídas`} tom="neutro" />
                  }
                >
                  {dados?.avisoSaidas ? (
                    <AlertaCompacto
                      variante="indisponivel"
                      descricao={dados.avisoSaidas}
                      tamanho="linha"
                    />
                  ) : null}
                  {item.saidas.length === 0 ? (
                    <ResumoVazio texto="Nenhuma saída antecipada nesta semana." />
                  ) : (
                    <List disablePadding>
                      {item.saidas.map((saida) => (
                        <ListItem key={saida.id} divider sx={{ px: 0, py: 1 }}>
                          <Typography variant="body2">
                            <Box component="span" sx={{ fontWeight: 500 }}>
                              {saida.nome}
                            </Box>
                            <Box component="span" sx={{ color: "text.secondary" }}>
                              {` · ${rotuloData(saida.dia)} · ${rotuloMomento(saida.momento)}`}
                              {saida.horario ? ` · ${saida.horario}` : ""}
                            </Box>
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </SecaoResumo>
              ) : null}
            </Box>
          );
        })}

        {painel && mostrarSaidas ? (
          <SecaoResumo
            id="movimentacoes"
            titulo="Movimentações"
            descricao="Saídas e entradas da semana, com a turma gravada em cada registro."
            icone={ScheduleRoundedIcon}
            aberto={aberta("movimentacoes")}
            onAbertoChange={(valor) => alternar("movimentacoes", valor)}
            resumo={
              <Selo component="span" rotulo={`${movimentacoes.length} registros`} tom="neutro" />
            }
          >
            {dados?.avisoSaidas ? (
              <AlertaCompacto
                variante="indisponivel"
                descricao={dados.avisoSaidas}
                tamanho="linha"
              />
            ) : null}
            {dados?.avisoEntradas ? (
              <AlertaCompacto
                variante="indisponivel"
                descricao={dados.avisoEntradas}
                tamanho="linha"
              />
            ) : null}
            <Box
              component="ul"
              aria-label="Movimentações por dia"
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(3, minmax(0, 1fr))",
                  sm: "repeat(6, minmax(0, 1fr))",
                },
                gap: 0.5,
                listStyle: "none",
                m: 0,
                p: 0,
              }}
            >
              {movimentacoesPorDia.map((item) => (
                <Stack
                  component="li"
                  key={item.dia}
                  spacing={0.25}
                  sx={(theme) => ({
                    alignItems: "center",
                    borderRadius: 1.5,
                    border: `1px solid ${theme.vars.palette.divider}`,
                    backgroundColor: theme.vars.palette.action.hover,
                    px: 1,
                    py: 0.75,
                  })}
                >
                  <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
                    {rotuloCurtoDoDia(item.dia)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                  >
                    {item.total}
                  </Typography>
                </Stack>
              ))}
            </Box>
            <ListaMovimentacoes itens={movimentacoes} />
          </SecaoResumo>
        ) : null}

        {painel ? (
          <SecaoResumo
            id="pendenciasSeduc"
            titulo="Pendentes na Seduc"
            descricao="Registros efetivos que exigem conferência na Seduc."
            icone={AssignmentRoundedIcon}
            aberto={aberta("pendenciasSeduc")}
            onAbertoChange={(valor) => alternar("pendenciasSeduc", valor)}
            resumo={
              <Selo
                component="span"
                rotulo={`${pendenciasSeduc.length} pendentes`}
                tom={pendenciasSeduc.length === 0 ? "sucesso" : "atencao"}
              />
            }
          >
            {dados?.avisoParciais ? (
              <AlertaCompacto
                variante="indisponivel"
                descricao={dados.avisoParciais}
                tamanho="linha"
              />
            ) : null}
            {pendenciasSeduc.length === 0 ? (
              <ResumoVazio texto="Nenhuma pendência na Seduc nesta semana." />
            ) : (
              <>
                <List disablePadding>
                  {pendenciasSeduc.map((item) => (
                    <ListItem key={item.id} divider sx={{ px: 0, py: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, overflowWrap: "anywhere" }}
                        >
                          {item.nome}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {item.turma} · {rotuloData(item.dia)} · {item.tipo}
                        </Typography>
                      </Box>
                    </ListItem>
                  ))}
                </List>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  A conferência e a confirmação ficam na Chamada Parcial.
                </Typography>
              </>
            )}
          </SecaoResumo>
        ) : null}
      </CorpoResumo>
    </Paper>
  );
}
