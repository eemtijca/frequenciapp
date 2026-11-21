"use client";

// Painel Turmas recolhível, com séries que agrupam as turmas e seu progresso.
// A seleção continua independente da conclusão, com nomes e estados acessíveis.
import { useId, useMemo, useRef, useState } from "react";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import type { Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alunoDesistenteNoDia, type Aluno, type Frequencia, type Turma } from "@/domain/frequencia";
import { coberturaDoDia } from "@/domain/relatorios";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  turmaId: string;
  dia: string;
  frequencias: Frequencia[];
  coberturaDisponivel: boolean;
  carregando: boolean;
  temAlteracoes: boolean;
  feriado?: string;
  /** Bloqueia a troca (alterações por salvar, carregamento ou salvamento). */
  travado: boolean;
  /** Domingo com o resumo da semana: não há chamada do dia para conferir. */
  semCobertura?: boolean;
  onEscolher: (turmaId: string) => void;
}

type Situacao =
  "carregando" | "indisponivel" | "sem-alunos" | "pendente" | "concluida" | "feriado" | "semana";

const ROTULOS: Record<Situacao, string> = {
  carregando: "Conferindo chamadas",
  indisponivel: "Não foi possível conferir as chamadas",
  "sem-alunos": "Sem alunos para a chamada",
  pendente: "Chamada pendente",
  concluida: "Chamada salva",
  feriado: "Feriado, sem chamada prevista",
  semana: "Resumo da semana",
};

function nomeDaSerie(nome: string): string {
  return nome.replace(/^(\d+)[º°]?\s+ano$/i, "$1ª série");
}

function estilosBloco(
  theme: Theme,
  situacao: Situacao,
  selecionado: boolean,
  semMovimento: boolean,
) {
  const palette = theme.vars.palette;
  const transicao = semMovimento
    ? "none"
    : theme.transitions.create(["background-color", "border-color", "color"], {
        duration: 150,
      });

  return {
    display: "flex",
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    gap: 1,
    border: `1px solid ${selecionado ? palette.justificada.main : palette.divider}`,
    borderRadius: 2,
    backgroundColor: selecionado
      ? palette.justificada.fraco
      : situacao === "concluida"
        ? palette.action.selected
        : palette.background.paper,
    color: selecionado ? palette.justificada.texto : palette.text.primary,
    textAlign: "left" as const,
    transition: transicao,
    "&:hover": {
      backgroundColor: selecionado
        ? palette.justificada.fraco
        : situacao === "concluida"
          ? palette.action.selected
          : palette.action.hover,
    },
    "&.Mui-disabled": {
      backgroundColor: palette.action.disabledBackground,
      color: palette.text.disabled,
      cursor: "not-allowed",
    },
    "@media (forced-colors: active)": {
      borderColor: selecionado ? "Highlight" : "ButtonText",
      backgroundColor: "Canvas",
      color: "CanvasText",
    },
  };
}

function BarraProgresso({ progresso }: { progresso: number | null }) {
  if (progresso === null) return null;
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-progresso={progresso}
      sx={(theme) => ({
        display: "block",
        height: 6,
        minWidth: 24,
        maxWidth: 160,
        flex: 1,
        overflow: "hidden",
        borderRadius: "999px",
        backgroundColor: theme.vars.palette.action.hover,
        "@media (forced-colors: active)": {
          border: "1px solid CanvasText",
          backgroundColor: "Canvas",
        },
      })}
    >
      <Box
        component="span"
        sx={(theme) => ({
          display: "block",
          height: "100%",
          width: `${progresso}%`,
          borderRadius: "inherit",
          backgroundColor: theme.vars.palette.primary.main,
          "@media (forced-colors: active)": { backgroundColor: "Highlight" },
        })}
      />
    </Box>
  );
}

function Seta({ aberto }: { aberto: boolean }) {
  return (
    <KeyboardArrowDownRoundedIcon
      aria-hidden="true"
      fontSize="small"
      sx={(theme: Theme) => ({
        flexShrink: 0,
        color: theme.vars.palette.text.secondary,
        transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
        transition: theme.transitions.create("transform", { duration: 150 }),
      })}
    />
  );
}

function AnelProgresso({
  progresso,
  concluida,
  semMovimento,
}: {
  progresso: number | null;
  concluida: boolean;
  semMovimento: boolean;
}) {
  if (progresso === null) return null;
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-progresso={progresso}
      sx={(theme) => ({
        position: "absolute",
        inset: 3,
        color: concluida ? theme.vars.palette.primary.main : theme.vars.palette.text.disabled,
        pointerEvents: "none",
        transition: semMovimento ? "none" : "color 180ms ease",
        "@media (forced-colors: active)": {
          color: concluida ? "Highlight" : "CanvasText",
        },
      })}
    >
      <Box
        component="svg"
        viewBox="0 0 64 64"
        focusable="false"
        sx={{ display: "block", width: "100%", height: "100%" }}
      >
        <rect
          x="5"
          y="5"
          width="54"
          height="54"
          rx="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </Box>
    </Box>
  );
}

export function SeletorTurmaChamada({
  turmas,
  alunos,
  turmaId,
  dia,
  frequencias,
  coberturaDisponivel,
  carregando,
  temAlteracoes,
  feriado,
  travado,
  semCobertura = false,
  onEscolher,
}: Props) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const [serieRecolhida, setSerieRecolhida] = useState<string | null>(null);
  const semMovimento = useMediaQuery("(prefers-reduced-motion: reduce)");
  const tempoColapso = semMovimento ? 0 : 180;

  const series = useMemo(() => {
    const grupos: { id: string; nome: string; turmas: Turma[] }[] = [];
    for (const opcao of turmas) {
      const existente = grupos.find((grupo) => grupo.id === opcao.serieId);
      if (existente) existente.turmas.push(opcao);
      else grupos.push({ id: opcao.serieId, nome: opcao.serieNome, turmas: [opcao] });
    }
    return grupos;
  }, [turmas]);

  const participantes = useMemo(
    () => alunos.filter((aluno) => aluno.ativo && !alunoDesistenteNoDia(aluno, dia)),
    [alunos, dia],
  );

  const cobertura = useMemo(
    () =>
      coberturaDoDia(
        turmas,
        participantes,
        frequencias.filter((item) => item.dia === dia),
        Boolean(feriado),
      ).turmas.map((item) => ({
        ...item,
        concluida: item.concluida && !(item.turma.id === turmaId && temAlteracoes),
      })),
    [turmas, participantes, frequencias, dia, turmaId, temAlteracoes, feriado],
  );

  const contagem = useMemo(() => {
    const porTurma = new Map<string, number>();
    for (const aluno of participantes) {
      porTurma.set(aluno.turmaId, (porTurma.get(aluno.turmaId) ?? 0) + 1);
    }
    return porTurma;
  }, [participantes]);

  function situacaoDe(total: number, concluida: boolean): Situacao {
    if (semCobertura) return "semana";
    if (feriado) return "feriado";
    if (total === 0) return "sem-alunos";
    if (!coberturaDisponivel) return carregando ? "carregando" : "indisponivel";
    return concluida ? "concluida" : "pendente";
  }

  const ativa = series.find((grupo) => grupo.turmas.some((opcao) => opcao.id === turmaId));

  const resumos = series.map((grupo) => {
    const total = grupo.turmas.reduce((soma, opcao) => soma + (contagem.get(opcao.id) ?? 0), 0);
    const turmasDaSerie = cobertura.filter((item) => item.turma.serieId === grupo.id);
    const registrados = turmasDaSerie.reduce(
      (soma, item) => soma + (item.concluida ? item.esperados : 0),
      0,
    );
    const progresso = total > 0 ? Math.floor((registrados * 100) / total) : 0;
    const situacao = situacaoDe(
      total,
      turmasDaSerie.every((item) => item.concluida),
    );
    const percentual =
      !semCobertura && !feriado && coberturaDisponivel && total > 0 ? progresso : null;
    const descricao = semCobertura
      ? `${total} ${total === 1 ? "aluno" : "alunos"}. ${ROTULOS.semana}.`
      : `${total} ${total === 1 ? "aluno" : "alunos"}. ${ROTULOS[situacao]}${feriado ? `. ${feriado}.` : coberturaDisponivel && total > 0 ? `. ${progresso}% concluído. ${turmasDaSerie.map((item) => `${item.turma.rotulo}: ${item.concluida ? "chamada salva" : "chamada pendente"}`).join("; ")}` : "."}`;
    return {
      grupo,
      nome: nomeDaSerie(grupo.nome),
      percentual,
      situacao,
      descricao,
      total,
      registrados,
    };
  });
  const totalGeral = resumos.reduce((soma, resumo) => soma + resumo.total, 0);
  const registradosGeral = resumos.reduce((soma, resumo) => soma + resumo.registrados, 0);
  const progressoGeral =
    !semCobertura && !feriado && coberturaDisponivel && totalGeral > 0
      ? Math.floor((registradosGeral * 100) / totalGeral)
      : null;
  const situacaoGeral = situacaoDe(totalGeral, registradosGeral === totalGeral);

  function aoTocarSerie(grupoId: string) {
    if (travado && grupoId !== ativa?.id) return;
    if (grupoId === ativa?.id) {
      setSerieRecolhida((anterior) => (anterior === grupoId ? null : grupoId));
      return;
    }
    setSerieRecolhida(null);
    const primeira = series.find((grupo) => grupo.id === grupoId)?.turmas[0];
    if (primeira) onEscolher(primeira.id);
  }

  return (
    <Box
      role="group"
      aria-label="Turma atual"
      sx={{ minWidth: 0, p: 0.5 }}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && aberto) {
          evento.preventDefault();
          evento.stopPropagation();
          setAberto(false);
          gatilho.current?.focus();
        }
      }}
    >
      <ButtonBase
        ref={gatilho}
        type="button"
        aria-label="Turmas"
        aria-expanded={aberto}
        aria-describedby={`${id}-progresso-geral`}
        data-situacao={situacaoGeral}
        disabled={series.length === 0}
        onClick={() => setAberto((atual) => !atual)}
        sx={(theme) => ({
          ...estilosBloco(theme, situacaoGeral, false, semMovimento),
          minHeight: TOKENS_LAYOUT.alvoToque,
          borderRadius: 2,
          px: 1.75,
          py: 1,
          gap: 1.5,
        })}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{ flex: "0 1 auto", minWidth: 0, fontWeight: 600, fontSize: 13 }}
        >
          Turmas
        </Box>
        <BarraProgresso progresso={progressoGeral} />
        <Box
          component="span"
          aria-hidden="true"
          sx={(theme) => ({
            flexShrink: 0,
            borderRadius: "999px",
            px: 1,
            py: 0.25,
            backgroundColor: theme.vars.palette.action.hover,
            color:
              situacaoGeral === "concluida"
                ? theme.vars.palette.primary.main
                : theme.vars.palette.text.secondary,
            fontSize: 13,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          })}
        >
          {progressoGeral === null ? "-" : `${progressoGeral}%`}
        </Box>
        <Seta aberto={aberto} />
        <Box
          component="span"
          id={`${id}-progresso-geral`}
          sx={{
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
          }}
        >
          {totalGeral} {totalGeral === 1 ? "aluno" : "alunos"}. {ROTULOS[situacaoGeral]}.
          {progressoGeral !== null
            ? ` Progresso geral do dia: ${progressoGeral}%, considerando os alunos de todas as séries.`
            : ""}
          {feriado ? ` ${feriado}.` : ""}
        </Box>
      </ButtonBase>

      <Collapse in={aberto} timeout={tempoColapso}>
        <Box
          role="group"
          aria-label="Séries"
          sx={{ display: "flex", flexDirection: "column", gap: 1, p: 0.5 }}
        >
          {resumos.map(({ grupo, nome, situacao, percentual, descricao }) => {
            const ehAtiva = grupo.id === ativa?.id;
            const expandida = ehAtiva && serieRecolhida !== grupo.id;
            return (
              <Box
                key={grupo.id}
                data-selecionada={ehAtiva ? "true" : "false"}
                sx={(theme) => ({
                  minWidth: 0,
                  borderRadius: 2,
                  backgroundColor: ehAtiva
                    ? theme.vars.palette.action.hover
                    : theme.vars.palette.background.paper,
                  "@media (forced-colors: active)": {
                    border: "1px solid ButtonText",
                    backgroundColor: "Canvas",
                  },
                })}
              >
                <ButtonBase
                  type="button"
                  aria-label={nome}
                  aria-describedby={`${id}-serie-${grupo.id}`}
                  aria-expanded={expandida}
                  aria-pressed={ehAtiva}
                  data-situacao={situacao}
                  disabled={travado && !ehAtiva}
                  onClick={() => aoTocarSerie(grupo.id)}
                  sx={(theme) => ({
                    ...estilosBloco(theme, situacao, ehAtiva, semMovimento),
                    minHeight: TOKENS_LAYOUT.alvoToque,
                    px: 1.75,
                    py: 1,
                    gap: 1.5,
                  })}
                >
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {nome}
                  </Box>
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={(theme) => ({
                      flexShrink: 0,
                      color: ehAtiva
                        ? theme.vars.palette.justificada.texto
                        : theme.vars.palette.text.secondary,
                      fontSize: 13,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    })}
                  >
                    {percentual === null ? "-" : `${percentual}%`}
                  </Box>
                  <Seta aberto={expandida} />
                  <Box
                    component="span"
                    id={`${id}-serie-${grupo.id}`}
                    sx={{
                      position: "absolute",
                      width: "1px",
                      height: "1px",
                      overflow: "hidden",
                      clip: "rect(0, 0, 0, 0)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {descricao}
                  </Box>
                </ButtonBase>
                <Collapse in={expandida} timeout={tempoColapso}>
                  <Box
                    role="group"
                    aria-label={`Turmas de ${nome}`}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      alignItems: "stretch",
                      gap: 1,
                      p: 1.25,
                    }}
                  >
                    {grupo.turmas.map((opcao) => {
                      const ativo = opcao.id === turmaId;
                      const total = contagem.get(opcao.id) ?? 0;
                      const salva =
                        cobertura.find((item) => item.turma.id === opcao.id)?.concluida ?? false;
                      const situacao = situacaoDe(total, salva);
                      const progresso =
                        situacao === "concluida" ? 100 : situacao === "pendente" ? 0 : null;
                      return (
                        <ButtonBase
                          key={opcao.id}
                          type="button"
                          aria-label={opcao.rotulo}
                          aria-describedby={`${id}-turma-${opcao.id}`}
                          title={`${opcao.rotulo}: ${ROTULOS[situacao]}`}
                          data-situacao={situacao}
                          aria-pressed={ativo}
                          disabled={travado}
                          onClick={() => onEscolher(opcao.id)}
                          sx={(theme) => ({
                            position: "relative",
                            display: "flex",
                            width: "min(100%, 64px)",
                            minHeight: 44,
                            aspectRatio: "1",
                            alignItems: "center",
                            justifyContent: "center",
                            justifySelf: "center",
                            alignSelf: "start",
                            border: `1px solid ${
                              ativo
                                ? theme.vars.palette.justificada.main
                                : theme.vars.palette.divider
                            }`,
                            borderRadius: 2,
                            p: 1,
                            backgroundColor: ativo
                              ? theme.vars.palette.justificada.fraco
                              : theme.vars.palette.background.paper,
                            color: ativo
                              ? theme.vars.palette.justificada.texto
                              : theme.vars.palette.text.primary,
                            "@media (forced-colors: active)": {
                              borderColor: ativo ? "Highlight" : "ButtonText",
                              backgroundColor: "Canvas",
                              color: "CanvasText",
                            },
                          })}
                        >
                          <Box
                            component="span"
                            aria-hidden="true"
                            sx={{
                              position: "relative",
                              maxWidth: "100%",
                              overflowWrap: "anywhere",
                              fontSize: 13,
                              fontWeight: 600,
                              lineHeight: 1.2,
                            }}
                          >
                            {opcao.nome}
                          </Box>
                          <AnelProgresso
                            progresso={progresso}
                            concluida={situacao === "concluida"}
                            semMovimento={semMovimento}
                          />
                          <Box
                            component="span"
                            id={`${id}-turma-${opcao.id}`}
                            sx={{
                              position: "absolute",
                              width: "1px",
                              height: "1px",
                              overflow: "hidden",
                              clip: "rect(0, 0, 0, 0)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {total} {total === 1 ? "aluno" : "alunos"}. {ROTULOS[situacao]}
                            {progresso !== null ? `. ${progresso}% concluído` : ""}
                            {feriado
                              ? `. ${feriado}.`
                              : temAlteracoes && ativo
                                ? ". Alterações por salvar"
                                : "."}
                          </Box>
                        </ButtonBase>
                      );
                    })}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
