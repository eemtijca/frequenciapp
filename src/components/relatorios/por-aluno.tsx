"use client";

// Relatório por aluno no mês, com acumulado do histórico e grupos recolhíveis por turma.
import {
  memo,
  useDeferredValue,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded";
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type {
  Aluno,
  Frequencia,
  Horario,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import {
  diasDoMes,
  marcaDoAluno,
  mesSeguinte,
  normalizar,
  partesJustificativaSaida,
  rotuloMes,
  rotuloMomento,
} from "@/domain/frequencia";
import { CirculosAcumulado } from "@/components/ui/mui/circulo-contagem";
import { indexarPorDia, resumoPorAluno, type ResumoAlunoPeriodo } from "@/domain/relatorios";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { useAvisosDaSessao } from "@/lib/avisos";
import { TOKENS_LAYOUT } from "@/theme/layout";

const ALVO_MES = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
  flexShrink: 0,
};

interface Props {
  alunos: Aluno[];
  series: Serie[];
  turmas: Turma[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  resumo: ResumoAcumulado | null;
  mes: string;
  mesCorrente: string;
  onMes: (mes: string) => void;
}

interface DetalheProps {
  aluno: Aluno;
  dias: string[];
  porDia: Map<string, Frequencia[]>;
  horarios: Horario[];
  saidas: SaidaAntecipada[];
}

/** Detalhe do aluno: marcas do mês e saídas antecipadas. */
function DetalheAluno({ aluno, dias, porDia, horarios, saidas }: DetalheProps) {
  const marcas = dias
    .map((dia) => ({ dia, marca: marcaDoAluno(aluno, dia, porDia.get(dia) ?? [], horarios) }))
    .filter((item) => item.marca !== null);
  const saidasDoAluno = saidas.filter((saida) => saida.alunoId === aluno.id);
  if (marcas.length === 0 && saidasDoAluno.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Nenhum registro neste mês.
      </Typography>
    );
  }
  return (
    <Stack spacing={2}>
      {marcas.length > 0 ? (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          {marcas.map(({ dia, marca }) => (
            <Box
              component="span"
              key={dia}
              sx={[
                (tema) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 0.75,
                  py: 0.25,
                  fontSize: 11,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  color: tema.vars.palette.text.secondary,
                }),
                marca === "F"
                  ? (tema) => ({
                      borderColor: tema.vars.palette.falta.main,
                      backgroundColor: tema.vars.palette.falta.fraco,
                      color: tema.vars.palette.falta.texto,
                    })
                  : marca === "FJ"
                    ? (tema) => ({
                        borderColor: tema.vars.palette.justificada.main,
                        backgroundColor: tema.vars.palette.justificada.fraco,
                        color: tema.vars.palette.justificada.texto,
                      })
                    : marca === "S"
                      ? (tema) => ({
                          borderColor: tema.vars.palette.falta.main,
                          color: tema.vars.palette.falta.texto,
                        })
                      : null,
              ]}
            >
              <Box component="span">
                {`${dia.slice(8)}/${dia.slice(5, 7)}`}
                <Box component="strong">{marca}</Box>
              </Box>
            </Box>
          ))}
        </Stack>
      ) : null}
      {saidasDoAluno.length > 0 ? (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {saidasDoAluno.map((saida) => {
            const partes = partesJustificativaSaida(saida);
            return (
              <Box component="li" key={saida.id}>
                <Typography
                  variant="caption"
                  sx={{ display: "block", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                >
                  {saida.dia.split("-").reverse().join("/")}
                </Typography>
                <CaixasDeInfo
                  itens={[
                    rotuloMomento(saida.momento),
                    partes.motivo,
                    partes.complemento,
                    saida.liberadoPorNome ? `Liberado por ${saida.liberadoPorNome}` : "",
                  ]}
                />
              </Box>
            );
          })}
        </Stack>
      ) : null}
    </Stack>
  );
}

interface LinhaResumo {
  aluno: Aluno;
  nomeNormalizado: string;
  resumo: ResumoAlunoPeriodo;
}

interface GrupoTurma {
  turma: Turma;
  linhas: LinhaResumo[];
}

interface GrupoSerie {
  serie: Pick<Serie, "id" | "nome">;
  turmas: GrupoTurma[];
  alunos: number;
}

function contagemDeAlunos(total: number): string {
  return `${total} ${total === 1 ? "aluno" : "alunos"}`;
}

const ESTILO_IDENTIDADE = { minWidth: 0, flex: 1, overflowWrap: "anywhere" } as const;
// O cartão recorta os cantos. O anel precisa ficar dentro do botão de largura total.
const FOCO_INTERNO = {
  "&.Mui-focusVisible": { outlineOffset: -5 },
  "@media (forced-colors: active)": {
    // Mantém a cor do provedor e deixa 4 px entre o anel e os cantos do cartão.
    'html[data-foco-teclado="true"] &:focus-visible': { outlineOffset: -7 },
  },
} as const;

interface CabecalhoGrupoProps {
  titulo: string;
  total: number;
  aberto: boolean;
  nivel: "serie" | "turma";
  linhas?: LinhaResumo[];
  onAlternar: () => void;
}

/** Cabeçalho de série ou turma: recolhe e expande os alunos abaixo dele. */
function CabecalhoGrupo({ titulo, total, aberto, nivel, linhas, onAlternar }: CabecalhoGrupoProps) {
  return (
    <ButtonBase
      aria-expanded={aberto}
      onClick={onAlternar}
      sx={[
        {
          display: "flex",
          width: "100%",
          minHeight: 48,
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 1,
          textAlign: "left",
          justifyContent: "flex-start",
          "&:hover": { bgcolor: "action.hover" },
          ...FOCO_INTERNO,
        },
        nivel === "serie" ? { bgcolor: "action.hover", fontWeight: 700 } : { fontWeight: 600 },
      ]}
    >
      <ExpandMoreRoundedIcon
        aria-hidden="true"
        sx={{
          flexShrink: 0,
          color: "text.secondary",
          transform: aberto ? "none" : "rotate(-90deg)",
          transition: (tema) => tema.transitions.create("transform", { duration: 150 }),
        }}
      />
      <Box component="span" sx={ESTILO_IDENTIDADE}>
        <Typography component="span" sx={{ display: "block", fontWeight: "inherit" }}>
          {titulo}
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", fontWeight: 400 }}
        >
          {contagemDeAlunos(total)}
        </Typography>
      </Box>
      {linhas ? (
        <CirculosAcumulado
          faltas={linhas.reduce((soma, { resumo }) => soma + resumo.faltas, 0)}
          justificadas={linhas.reduce((soma, { resumo }) => soma + resumo.justificadas, 0)}
          saidas={linhas.reduce((soma, { resumo }) => soma + resumo.saidas, 0)}
        />
      ) : null}
    </ButtonBase>
  );
}

interface ListaAlunosProps {
  linhas: LinhaResumo[];
  expandido: string | null;
  setExpandido: Dispatch<SetStateAction<string | null>>;
  rotuloTurma: (id: string) => string;
  acumuladoDe: (id: string) => ResumoAcumulado["porAluno"][number] | null;
  resumo: ResumoAcumulado | null;
  dias: string[];
  porDia: Map<string, Frequencia[]>;
  horarios: Horario[];
  saidas: SaidaAntecipada[];
}

// A lista mantém o último filtro enquanto o campo de busca responde à digitação.
const ListaAlunos = memo(function ListaAlunos({
  linhas,
  expandido,
  setExpandido,
  rotuloTurma,
  acumuladoDe,
  resumo,
  dias,
  porDia,
  horarios,
  saidas,
}: ListaAlunosProps) {
  return (
    <Box
      component="ul"
      sx={{ listStyle: "none", m: 0, p: 0, borderTop: 1, borderColor: "divider" }}
    >
      {linhas.map(({ aluno, resumo: doAluno }) => {
        const acumulado = acumuladoDe(aluno.id);
        const aberto = expandido === aluno.id;
        return (
          <Box
            component="li"
            key={aluno.id}
            sx={{ borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}
          >
            <ButtonBase
              aria-expanded={aberto}
              onClick={() => setExpandido((atual) => (atual === aluno.id ? null : aluno.id))}
              sx={{
                display: "flex",
                width: "100%",
                minHeight: 56,
                alignItems: "center",
                flexWrap: "wrap",
                columnGap: 1,
                rowGap: 0.5,
                px: 2,
                py: 1,
                textAlign: "left",
                justifyContent: "flex-start",
                "&:hover": { bgcolor: "action.hover" },
                ...FOCO_INTERNO,
              }}
            >
              <Box
                component="span"
                sx={{ ...ESTILO_IDENTIDADE, flexBasis: (tema) => tema.spacing(29) }}
              >
                <Typography component="span" sx={{ display: "block", fontWeight: 500 }}>
                  {aluno.nome}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                  {rotuloTurma(aluno.turmaId)}
                  {aluno.turmaOriginalId !== aluno.turmaId
                    ? ` · origem ${rotuloTurma(aluno.turmaOriginalId)}`
                    : ""}
                </Typography>
              </Box>
              <Box component="span" sx={{ ml: "auto", display: "flex" }}>
                <CirculosAcumulado
                  faltas={doAluno.faltas}
                  justificadas={doAluno.justificadas}
                  saidas={doAluno.saidas}
                />
              </Box>
            </ButtonBase>
            {aberto ? (
              <Box
                sx={{
                  bgcolor: "action.hover",
                  borderTop: 1,
                  borderColor: "divider",
                  px: 2,
                  py: 1.5,
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: "center", flexWrap: "wrap", mb: 1 }}
                >
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Acumulado desde{" "}
                    {resumo?.primeiroDia
                      ? resumo.primeiroDia.split("-").reverse().join("/")
                      : "a primeira chamada"}
                  </Typography>
                  <CirculosAcumulado
                    faltas={acumulado?.faltas ?? 0}
                    justificadas={acumulado?.faltasJustificadas ?? 0}
                  />
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    em {resumo?.diasLetivos ?? 0}{" "}
                    {resumo?.diasLetivos === 1 ? "dia letivo" : "dias letivos"}
                  </Typography>
                </Stack>
                <DetalheAluno
                  aluno={aluno}
                  dias={dias}
                  porDia={porDia}
                  horarios={horarios}
                  saidas={saidas}
                />
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
});

export default function PorAluno({
  alunos,
  series,
  turmas,
  frequencias,
  saidas,
  resumo,
  mes,
  mesCorrente,
  onMes,
}: Props) {
  const { avisarInfo } = useAvisosDaSessao();
  const [busca, setBusca] = useState("");
  const [seriesFechadas, setSeriesFechadas] = useState<ReadonlySet<string>>(new Set());
  const [turmasFechadas, setTurmasFechadas] = useState<ReadonlySet<string>>(new Set());
  const [expandido, setExpandido] = useState<string | null>(null);

  const rotuloTurma = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Sem turma";
  }, [turmas]);

  const acumuladoDe = useMemo(() => {
    const mapa = new Map((resumo?.porAluno ?? []).map((item) => [item.alunoId, item]));
    return (alunoId: string) => mapa.get(alunoId) ?? null;
  }, [resumo]);

  const dias = useMemo(() => diasDoMes(mes), [mes]);
  const porDia = useMemo(() => indexarPorDia(frequencias), [frequencias]);
  const horarios = useMemo(() => turmas.flatMap((turma) => turma.horarios), [turmas]);

  // Os cálculos do mês e a ordenação não dependem da digitação nem dos filtros.
  const resumos = useMemo(
    () =>
      alunos
        .filter((aluno) => aluno.ativo)
        .map((aluno) => ({
          aluno,
          nomeNormalizado: normalizar(aluno.nome),
          resumo: resumoPorAluno(aluno, dias, porDia, saidas, horarios),
        }))
        .sort(
          (a, b) =>
            b.resumo.faltas + b.resumo.justificadas - (a.resumo.faltas + a.resumo.justificadas) ||
            a.aluno.nome.localeCompare(b.aluno.nome, "pt-BR"),
        ),
    [alunos, dias, porDia, saidas, horarios],
  );
  const termo = useDeferredValue(normalizar(busca));
  const linhas = useMemo(
    () => resumos.filter(({ nomeNormalizado }) => termo === "" || nomeNormalizado.includes(termo)),
    [resumos, termo],
  );
  // Séries e turmas seguem a ordem do cadastro; só aparecem as que têm aluno na busca.
  const grupos = useMemo<GrupoSerie[]>(() => {
    const porTurma = new Map<string, LinhaResumo[]>();
    for (const linha of linhas) {
      porTurma.set(linha.aluno.turmaId, [...(porTurma.get(linha.aluno.turmaId) ?? []), linha]);
    }
    const ordemSeries = [...series].sort(
      (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"),
    );
    const resultado: GrupoSerie[] = [];
    for (const serie of ordemSeries) {
      const gruposTurma = turmas
        .filter((turma) => turma.serieId === serie.id && porTurma.has(turma.id))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }))
        .map((turma) => ({ turma, linhas: porTurma.get(turma.id) ?? [] }));
      if (gruposTurma.length === 0) continue;
      resultado.push({
        serie,
        turmas: gruposTurma,
        alunos: gruposTurma.reduce((soma, grupo) => soma + grupo.linhas.length, 0),
      });
    }
    return resultado;
  }, [linhas, series, turmas]);

  // Na busca, os grupos com resultado ficam abertos; o recolhimento volta ao limpar o campo.
  const buscando = termo !== "";
  const todasSeriesAbertas = grupos.every(({ serie }) => !seriesFechadas.has(serie.id));
  const todasTurmasAbertas =
    todasSeriesAbertas &&
    grupos.every(({ turmas: doGrupo }) =>
      doGrupo.every(({ turma }) => !turmasFechadas.has(turma.id)),
    );

  function alternarSeries() {
    setSeriesFechadas(
      todasSeriesAbertas ? new Set(grupos.map(({ serie }) => serie.id)) : new Set(),
    );
  }

  function alternarTurmas() {
    if (todasTurmasAbertas) {
      setTurmasFechadas(
        new Set(grupos.flatMap(({ turmas: doGrupo }) => doGrupo.map(({ turma }) => turma.id))),
      );
      return;
    }
    // Abrir as turmas também abre as séries, para o resultado aparecer na tela.
    setSeriesFechadas(new Set());
    setTurmasFechadas(new Set());
  }

  function alternarGrupo(
    atual: ReadonlySet<string>,
    definir: Dispatch<SetStateAction<ReadonlySet<string>>>,
    id: string,
  ) {
    const proximo = new Set(atual);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    definir(proximo);
  }

  return (
    <Box
      component="section"
      aria-label="Relatório por aluno"
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <Typography component="h1" variant="h4">
        Por aluno
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            flexGrow: 1,
            flexBasis: (tema) => tema.spacing(36),
            minWidth: 0,
            alignItems: "center",
          }}
        >
          <BotaoIcone
            rotulo="Mês anterior"
            variante="contorno"
            icone={<ChevronLeftRoundedIcon />}
            onClick={() => onMes(mesSeguinte(mes, -1))}
            sx={ALVO_MES}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SeletorPeriodo
              id="mes-por-aluno"
              modo="mes"
              valor={mes}
              max={mesCorrente}
              rotuloAcessivel="Mês do relatório"
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
            sx={ALVO_MES}
          />
        </Stack>
        <BarraBusca
          id="busca-por-aluno"
          valor={busca}
          onValor={setBusca}
          placeholder="Buscar aluno"
          sx={{ flexGrow: 2, flexBasis: (tema) => tema.spacing(36) }}
        />
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <Stack
          role="group"
          aria-label="Expansão da lista"
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          <Botao
            variante="contorno"
            icone={todasSeriesAbertas ? <UnfoldLessRoundedIcon /> : <UnfoldMoreRoundedIcon />}
            aria-expanded={todasSeriesAbertas}
            aria-label={`${todasSeriesAbertas ? "Recolher" : "Expandir"} todas as séries`}
            disabled={buscando || grupos.length === 0}
            onClick={alternarSeries}
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
          >
            Séries
          </Botao>
          <Botao
            variante="contorno"
            icone={todasTurmasAbertas ? <UnfoldLessRoundedIcon /> : <UnfoldMoreRoundedIcon />}
            aria-expanded={todasTurmasAbertas}
            aria-label={`${todasTurmasAbertas ? "Recolher" : "Expandir"} todas as turmas`}
            disabled={buscando || grupos.length === 0}
            onClick={alternarTurmas}
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
          >
            Turmas
          </Botao>
        </Stack>
        <Botao
          icone={<DescriptionRoundedIcon />}
          onClick={() =>
            avisarInfo(
              "Emissão de relatório em preparação",
              "A geração do relatório em PDF será liberada em breve.",
              "emitir-relatorio-por-aluno",
            )
          }
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque, ml: "auto" }}
        >
          Emitir relatório
        </Botao>
      </Stack>

      {linhas.length === 0 ? (
        <EstadoVazio
          icone={<PersonSearchRoundedIcon />}
          titulo="Nenhum aluno encontrado"
          descricao="Ajuste a busca."
        />
      ) : (
        <Paper variant="outlined" sx={{ overflow: "hidden", boxShadow: "none" }}>
          {grupos.map(({ serie, turmas: gruposTurma, alunos: totalSerie }) => {
            const serieAberta = buscando || !seriesFechadas.has(serie.id);
            return (
              <Box component="section" key={serie.id} aria-label={serie.nome}>
                <CabecalhoGrupo
                  nivel="serie"
                  titulo={serie.nome}
                  total={totalSerie}
                  aberto={serieAberta}
                  onAlternar={() => alternarGrupo(seriesFechadas, setSeriesFechadas, serie.id)}
                />
                {serieAberta
                  ? gruposTurma.map(({ turma, linhas: linhasTurma }) => {
                      const turmaAberta = buscando || !turmasFechadas.has(turma.id);
                      return (
                        <Box
                          component="section"
                          key={turma.id}
                          aria-label={turma.rotulo}
                          sx={{ borderTop: 1, borderColor: "divider" }}
                        >
                          <CabecalhoGrupo
                            nivel="turma"
                            titulo={turma.rotulo}
                            total={linhasTurma.length}
                            linhas={linhasTurma}
                            aberto={turmaAberta}
                            onAlternar={() =>
                              alternarGrupo(turmasFechadas, setTurmasFechadas, turma.id)
                            }
                          />
                          {turmaAberta ? (
                            <ListaAlunos
                              linhas={linhasTurma}
                              expandido={
                                linhasTurma.some(({ aluno }) => aluno.id === expandido)
                                  ? expandido
                                  : null
                              }
                              setExpandido={setExpandido}
                              rotuloTurma={rotuloTurma}
                              acumuladoDe={acumuladoDe}
                              resumo={resumo}
                              dias={dias}
                              porDia={porDia}
                              horarios={horarios}
                              saidas={saidas}
                            />
                          ) : null}
                        </Box>
                      );
                    })
                  : null}
              </Box>
            );
          })}
        </Paper>
      )}
    </Box>
  );
}
