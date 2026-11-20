"use client";

// Relatório conjunto de saídas e entradas, por turma ou por aluno, com período próprio.
import { useEffect, useMemo, useState } from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import NorthEastRoundedIcon from "@mui/icons-material/NorthEastRounded";
import SouthWestRoundedIcon from "@mui/icons-material/SouthWestRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  diaDaSemanaIso,
  diaSeguinte,
  rotuloData,
  partesDoMotivo,
  rotuloMomento,
  type Aluno,
  type Turma,
} from "@/domain/frequencia";
import {
  LIMITE_DIAS_RELATORIO_MOVIMENTACOES,
  movimentacoesPorAluno,
  type FiltroMovimentacoesPorAluno,
  type MovimentacaoRelatorio,
  type RelatorioMovimentacoes,
} from "@/domain/relatorio-movimentacoes";
import { pedir } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Cartao } from "@/components/ui/mui/cartao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Selo } from "@/components/ui/mui/selo";

type Modo = "dia" | "semana" | "periodo";
type Agrupamento = "turma" | "aluno";
interface Carga {
  chave: string;
  dados: RelatorioMovimentacoes | null;
  erro: string;
  variante: VarianteEstado;
}

const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: "turma", rotulo: "Por turma" },
  { valor: "aluno", rotulo: "Por aluno" },
];

const TODOS_OS_ALUNOS = "todos";

const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "periodo", rotulo: "Período personalizado" },
];

/** Totais de saídas e entradas, cada um na própria caixa. */
function contagens(saidas: number, entradas: number): string[] {
  return [
    `${saidas} ${saidas === 1 ? "saída" : "saídas"}`,
    `${entradas} ${entradas === 1 ? "entrada" : "entradas"}`,
  ];
}

/** Uma saída ou entrada, com o aluno quando o grupo é a turma. */
function LinhaMovimentacao({ item, comAluno }: { item: MovimentacaoRelatorio; comAluno: boolean }) {
  const entrada = item.tipo === "ENTRADA";
  return (
    <Box
      component="li"
      sx={{
        display: "grid",
        gap: 2,
        p: 2,
        gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) minmax(0, 1fr)" },
      }}
    >
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Selo
            rotulo={entrada ? "Entrada" : "Saída"}
            tom={entrada ? "sucesso" : "neutro"}
            icon={
              entrada ? (
                <SouthWestRoundedIcon aria-hidden="true" />
              ) : (
                <NorthEastRoundedIcon aria-hidden="true" />
              )
            }
          />
          <Box
            component="time"
            dateTime={item.dia}
            sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums", fontSize: 12 }}
          >
            {rotuloData(item.dia)}
          </Box>
          {item.horario ? (
            <Typography
              component="span"
              variant="caption"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              {item.horario}
            </Typography>
          ) : null}
        </Stack>
        {comAluno ? (
          <Typography sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>
            {item.alunoNome}
          </Typography>
        ) : null}
        {item.momento ? (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {rotuloMomento(item.momento)}
          </Typography>
        ) : null}
      </Stack>
      <Stack component="dl" spacing={1} sx={{ m: 0, minWidth: 0 }}>
        <Box>
          <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
            Motivo
          </Typography>
          <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>
            {item.motivo ? (
              <CaixasDeInfo itens={partesDoMotivo(item.motivo)} sx={{ mt: 0.5 }} />
            ) : (
              "Não informado"
            )}
          </Box>
        </Box>
        <Box>
          <Typography component="dt" variant="caption" sx={{ color: "text.secondary" }}>
            {item.tipo === "SAIDA" ? "Liberado por" : "Responsável pelo registro"}
          </Typography>
          <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>
            {item.responsavel ?? "Não informado"}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}

export default function VistaMovimentacoes({
  hoje,
  turmas,
  alunos,
  ativa,
  atualizacao = 0,
}: {
  hoje: string;
  turmas: Turma[];
  alunos: Aluno[];
  ativa: boolean;
  atualizacao?: number;
}) {
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(hoje);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [turmaId, setTurmaId] = useState("todas");
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("turma");
  const [alunoEscolhido, setAlunoEscolhido] = useState(TODOS_OS_ALUNOS);
  const [filtroAluno, setFiltroAluno] = useState<FiltroMovimentacoesPorAluno>("todas");
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [atividadeAnterior, setAtividadeAnterior] = useState(ativa);
  // Uma visita nova consulta os registros atualizados, mantendo apenas os filtros.
  if (atividadeAnterior !== ativa) {
    setAtividadeAnterior(ativa);
    setCarga(null);
  }
  const segunda = diaSeguinte(dia, -(diaDaSemanaIso(dia) - 1));
  const domingo = diaSeguinte(segunda, 6);
  const de = modo === "periodo" ? inicio : modo === "semana" ? segunda : dia;
  const ate =
    modo === "periodo" ? fim : modo === "semana" ? (domingo > hoje ? hoje : domingo) : dia;
  const dias =
    Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
  const erroPeriodo =
    ate < de
      ? "A data final deve ser igual ou posterior à inicial."
      : dias > LIMITE_DIAS_RELATORIO_MOVIMENTACOES
        ? `Escolha um período de até ${LIMITE_DIAS_RELATORIO_MOVIMENTACOES} dias.`
        : de > hoje || ate > hoje
          ? "Escolha um período até hoje."
          : "";
  const parametros = new URLSearchParams({ de, ate });
  if (turmaId !== "todas") parametros.set("turmaId", turmaId);
  const consulta = parametros.toString();
  const chave = `${consulta}|${recarga}|${atualizacao}`;
  const atual = carga?.chave === chave ? carga : null;
  const carregando = ativa && !erroPeriodo && !atual;
  const dados = !erroPeriodo ? atual?.dados : null;

  useEffect(() => {
    if (!ativa || erroPeriodo) return;
    const controlador = new AbortController();
    pedir<RelatorioMovimentacoes>(`/api/relatorios/movimentacoes?${consulta}`, {
      signal: controlador.signal,
    })
      .then((dados) => {
        if (!controlador.signal.aborted)
          setCarga({ chave, dados, erro: "", variante: "indisponivel" });
      })
      .catch((erro: unknown) => {
        if (!controlador.signal.aborted)
          setCarga({
            chave,
            dados: null,
            erro: mensagemAmigavel(erro, "Não foi possível carregar o relatório."),
            variante: estadoDeErro(erro),
          });
      });
    return () => controlador.abort();
  }, [ativa, chave, consulta, erroPeriodo]);

  // Relação dos alunos ativos da turma escolhida, ou de todas, na ordem das turmas e da chamada.
  const opcoesAluno = useMemo(() => {
    const ordemTurma = new Map(turmas.map((turma, indice) => [turma.id, indice]));
    const rotulos = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return alunos
      .filter((aluno) => aluno.ativo && (turmaId === "todas" || aluno.turmaId === turmaId))
      .sort(
        (a, b) =>
          (ordemTurma.get(a.turmaId) ?? 0) - (ordemTurma.get(b.turmaId) ?? 0) || a.ordem - b.ordem,
      )
      .map((aluno) => ({
        valor: aluno.id,
        rotulo:
          turmaId === "todas" ? `${aluno.nome} · ${rotulos.get(aluno.turmaId) ?? ""}` : aluno.nome,
      }));
  }, [alunos, turmaId, turmas]);
  // Uma escolha que saiu da lista, por troca de turma, volta a valer para todos.
  const alunoId = opcoesAluno.some((opcao) => opcao.valor === alunoEscolhido)
    ? alunoEscolhido
    : TODOS_OS_ALUNOS;
  const porAluno = useMemo(
    () =>
      dados
        ? movimentacoesPorAluno(
            dados.turmas,
            filtroAluno,
            alunoId === TODOS_OS_ALUNOS ? "" : alunoId,
          )
        : [],
    [dados, filtroAluno, alunoId],
  );
  const nomePeriodo = modo === "semana" ? "Semana" : "Dia";
  const passo = modo === "semana" ? 7 : 1;
  const proximoInicio = diaSeguinte(modo === "semana" ? segunda : dia, passo);

  return (
    <Box
      component="section"
      aria-label="Relatório de saídas e entradas"
      aria-busy={carregando}
      sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
    >
      <Typography component="h2" variant="h6">
        Saídas e Entradas
      </Typography>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        role="group"
        aria-label="Período do relatório"
        sx={{ flexWrap: "wrap" }}
      >
        {MODOS.map((item) => {
          const selecionado = modo === item.valor;
          return (
            <Botao
              key={item.valor}
              variante="contorno"
              aria-pressed={selecionado}
              onClick={() => setModo(item.valor)}
              sx={{ bgcolor: selecionado ? "action.selected" : undefined }}
            >
              {item.rotulo}
            </Botao>
          );
        })}
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        role="group"
        aria-label="Agrupamento do relatório"
        sx={{ flexWrap: "wrap" }}
      >
        {AGRUPAMENTOS.map((item) => {
          const selecionado = agrupamento === item.valor;
          return (
            <Botao
              key={item.valor}
              variante="contorno"
              aria-pressed={selecionado}
              onClick={() => setAgrupamento(item.valor)}
              sx={{ bgcolor: selecionado ? "action.selected" : undefined }}
            >
              {item.rotulo}
            </Botao>
          );
        })}
      </Stack>

      <Cartao component="div">
        <Grid container spacing={2}>
          {modo === "periodo" ? (
            <>
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Typography component="label" htmlFor="movimentacoes-de" variant="caption">
                    Data inicial
                  </Typography>
                  <SeletorPeriodo
                    id="movimentacoes-de"
                    modo="dia"
                    valor={inicio}
                    max={hoje}
                    rotuloAcessivel="Data inicial do relatório"
                    rotulo={rotuloData(inicio)}
                    onValor={setInicio}
                  />
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Typography component="label" htmlFor="movimentacoes-ate" variant="caption">
                    Data final
                  </Typography>
                  <SeletorPeriodo
                    id="movimentacoes-ate"
                    modo="dia"
                    valor={fim}
                    max={hoje}
                    rotuloAcessivel="Data final do relatório"
                    rotulo={rotuloData(fim)}
                    onValor={setFim}
                  />
                </Stack>
              </Grid>
            </>
          ) : (
            <Grid size={{ xs: 12, sm: 8, lg: 5 }}>
              <Stack spacing={1} sx={{ minWidth: 0 }}>
                <Typography component="label" htmlFor="movimentacoes-dia" variant="caption">
                  {modo === "semana" ? "Semana da data" : "Data"}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <BotaoIcone
                    rotulo={`${nomePeriodo} anterior do relatório`}
                    variante="contorno"
                    icone={<ChevronLeftRoundedIcon />}
                    onClick={() => setDia(diaSeguinte(dia, -passo))}
                    sx={{ width: 48, height: 48 }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <SeletorPeriodo
                      id="movimentacoes-dia"
                      modo="dia"
                      valor={dia}
                      max={hoje}
                      rotuloAcessivel="Data do relatório"
                      rotulo={rotuloData(dia)}
                      onValor={setDia}
                    />
                  </Box>
                  <BotaoIcone
                    rotulo={`${
                      nomePeriodo === "Semana" ? "Próxima semana" : "Próximo dia"
                    } do relatório`}
                    variante="contorno"
                    icone={<ChevronRightRoundedIcon />}
                    disabled={proximoInicio > hoje}
                    onClick={() =>
                      setDia(diaSeguinte(dia, passo) > hoje ? hoje : diaSeguinte(dia, passo))
                    }
                    sx={{ width: 48, height: 48 }}
                  />
                </Stack>
              </Stack>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 4, lg: 3 }}>
            <Stack spacing={1} sx={{ minWidth: 0 }}>
              <Typography component="label" htmlFor="movimentacoes-turma" variant="caption">
                Turma
              </Typography>
              <Selecionar
                id="movimentacoes-turma"
                ariaLabel="Turma do relatório de movimentações"
                valor={turmaId}
                onValor={setTurmaId}
                opcoes={[
                  { valor: "todas", rotulo: "Todas as turmas" },
                  ...turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
                ]}
              />
            </Stack>
          </Grid>
          {agrupamento === "aluno" ? (
            <>
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Typography component="label" htmlFor="movimentacoes-aluno" variant="caption">
                    Aluno
                  </Typography>
                  <Selecionar
                    id="movimentacoes-aluno"
                    ariaLabel="Aluno do relatório de movimentações"
                    valor={alunoId}
                    onValor={setAlunoEscolhido}
                    buscavel
                    opcoes={[{ valor: TODOS_OS_ALUNOS, rotulo: "Todos os alunos" }, ...opcoesAluno]}
                  />
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Typography component="label" htmlFor="movimentacoes-filtro" variant="caption">
                    Mostrar
                  </Typography>
                  <Selecionar
                    id="movimentacoes-filtro"
                    ariaLabel="Filtro de alunos do relatório"
                    valor={filtroAluno}
                    onValor={(valor) =>
                      setFiltroAluno(valor === "repetidas" ? "repetidas" : "todas")
                    }
                    opcoes={[
                      { valor: "todas", rotulo: "Todos com movimentações" },
                      { valor: "repetidas", rotulo: "Duas ou mais no período" },
                    ]}
                  />
                </Stack>
              </Grid>
            </>
          ) : null}
        </Grid>
      </Cartao>

      <Typography variant="body2" aria-live="polite" sx={{ color: "text.secondary" }}>
        {de === ate ? rotuloData(de) : `${rotuloData(de)} a ${rotuloData(ate)}`}
        {modo === "semana" && (domingo > hoje ? " · Semana até hoje" : " · Segunda a domingo")}
      </Typography>

      {erroPeriodo ? (
        <Typography role="alert" variant="body2" sx={{ color: "falta.texto" }}>
          {erroPeriodo}
        </Typography>
      ) : carregando ? (
        <Stack
          role="status"
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "center", py: 4 }}
        >
          <CircularProgress size={18} aria-hidden="true" />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Carregando saídas e entradas...
          </Typography>
        </Stack>
      ) : atual?.erro ? (
        <AlertaCompacto
          variante={atual.variante}
          titulo="Relatório indisponível"
          descricao={atual.erro}
          acao={{ rotulo: "Tentar de novo", onClick: () => setRecarga((valor) => valor + 1) }}
        />
      ) : dados ? (
        <>
          <Box
            component="dl"
            aria-label="Totais de movimentações"
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 2,
              m: 0,
            }}
          >
            <Cartao component="div">
              <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                Saídas
              </Typography>
              <Typography
                component="dd"
                variant="h4"
                sx={{ m: 0, mt: 0.5, fontVariantNumeric: "tabular-nums" }}
              >
                {dados.totais.saidas}
              </Typography>
            </Cartao>
            <Cartao component="div">
              <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                Entradas
              </Typography>
              <Typography
                component="dd"
                variant="h4"
                sx={{ m: 0, mt: 0.5, fontVariantNumeric: "tabular-nums" }}
              >
                {dados.totais.entradas}
              </Typography>
            </Cartao>
          </Box>
          {dados.turmas.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center", boxShadow: "none" }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Nenhuma saída ou entrada neste período.
              </Typography>
            </Paper>
          ) : agrupamento === "aluno" ? (
            porAluno.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: "center", boxShadow: "none" }}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {alunoId === TODOS_OS_ALUNOS
                    ? "Nenhum aluno encontrado com estes filtros."
                    : "Este aluno não tem saídas nem entradas neste período."}
                </Typography>
              </Paper>
            ) : (
              porAluno.map((aluno) => (
                <Paper
                  component="section"
                  variant="outlined"
                  key={aluno.alunoId}
                  aria-label={`Aluno ${aluno.alunoNome}`}
                  sx={{ minWidth: 0, overflow: "hidden", boxShadow: "none" }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      borderBottom: 1,
                      borderColor: "divider",
                      px: 2,
                      py: 1.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        component="h3"
                        variant="subtitle2"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {aluno.alunoNome}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                      >
                        {aluno.turmas.join(" · ")}
                      </Typography>
                    </Box>
                    <CaixasDeInfo itens={contagens(aluno.saidas, aluno.entradas)} />
                  </Stack>
                  <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {aluno.movimentacoes.map((item) => (
                      <LinhaMovimentacao
                        key={`${item.tipo}:${item.id}`}
                        item={item}
                        comAluno={false}
                      />
                    ))}
                  </Box>
                </Paper>
              ))
            )
          ) : (
            dados.turmas.map((grupo) => (
              <Paper
                component="section"
                variant="outlined"
                key={`${grupo.turmaId}:${grupo.turmaRotulo}`}
                aria-label={`Turma ${grupo.turmaRotulo}`}
                sx={{ minWidth: 0, overflow: "hidden", boxShadow: "none" }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    borderBottom: 1,
                    borderColor: "divider",
                    px: 2,
                    py: 1.5,
                  }}
                >
                  <Typography component="h3" variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
                    {grupo.turmaRotulo}
                  </Typography>
                  <CaixasDeInfo itens={contagens(grupo.saidas, grupo.entradas)} />
                </Stack>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {grupo.movimentacoes.map((item) => (
                    <LinhaMovimentacao key={`${item.tipo}:${item.id}`} item={item} comAluno />
                  ))}
                </Box>
              </Paper>
            ))
          )}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {agrupamento === "aluno"
              ? "Cada aluno reúne as saídas e as entradas do período, em todas as turmas."
              : "Entradas e saídas agrupadas pela turma gravada no registro; saídas sem referência ficam como turma histórica desconhecida."}
          </Typography>
        </>
      ) : null}
    </Box>
  );
}
