"use client";

// Seletor de período próprio em MUI: gatilho com rótulo amigável e popover
// ancorado com a grade do mês (dia) ou a grade de meses, sem campo nativo.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  celulasDoMes,
  celulasDoMesSegundaDomingo,
  celulasDoMesSemDomingo,
  diaDaSemanaIso,
  diaDeChamadaVizinho,
  diaSeguinte,
  diasDoMes,
  ehDomingo,
  mesSeguinte,
  nomeDoMes,
  rotuloMes,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  id: string;
  modo: "dia" | "mes";
  valor: string;
  max: string;
  min?: string;
  atual?: string;
  disabled?: boolean;
  rotuloAcessivel: string;
  rotulo: string;
  detalhe?: string;
  mostrarSelo?: boolean;
  /** Calendário de segunda a sábado: o domingo não aparece e a navegação o pula. */
  semDomingo?: boolean;
  /** Calendário de segunda a domingo, com dias adjacentes e domingo de resumo. */
  calendarioSemanal?: boolean;
  /** Avisa o resumo para pausar enquanto o calendário está aberto. */
  onAbertoChange?: (aberto: boolean) => void;
  /**
   * Atalho Hoje da tela. No domingo, a Chamada, o Painel e a Chamada Parcial
   * abrem o resumo da semana em vez de escolher o sábado.
   */
  aoHoje?: () => void;
  /** Hoje já está em foco: o atalho fica desabilitado. */
  hojeAtivo?: boolean;
  onValor: (valor: string) => void;
}

const SEMANAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const SEMANAS_SEGUNDA_DOMINGO = ["S", "T", "Q", "Q", "S", "S", "D"];
const SEMANAS_SEM_DOMINGO = SEMANAS.slice(1);
const MESES = Array.from({ length: 12 }, (_, indice) => indice + 1);
const DIAS = [
  ["domingo", "dom."],
  ["segunda-feira", "seg."],
  ["terça-feira", "ter."],
  ["quarta-feira", "qua."],
  ["quinta-feira", "qui."],
  ["sexta-feira", "sex."],
  ["sábado", "sáb."],
] as const;

const ALTURA_GATILHO = 44;
const ALTURA_CELULA = 44;
const LARGURA_PAINEL = "min(24rem, calc(100vw - 2rem))";

const ALVO_TOQUE = {
  position: "relative",
  "&::after": {
    content: '""',
    position: "absolute",
    top: "50%",
    left: "50%",
    width: `max(100%, ${TOKENS_LAYOUT.alvoToque}px)`,
    height: `max(100%, ${TOKENS_LAYOUT.alvoToque}px)`,
    transform: "translate(-50%, -50%)",
  },
} as const;

/** Mesmo dia em outro mês, limitado ao último dia do mês de destino. */
function mesmoDiaNoMes(dia: string, deslocamento: number): string {
  const alvo = mesSeguinte(dia.slice(0, 7), deslocamento);
  const ultimo = diasDoMes(alvo).length;
  const numero = Math.min(Number(dia.slice(8)), ultimo);
  return `${alvo}-${String(numero).padStart(2, "0")}`;
}

function colunas(semDomingo: boolean): string {
  return semDomingo ? "repeat(6, minmax(0, 1fr))" : "repeat(7, minmax(0, 1fr))";
}

function paletaDoTema(theme: Theme) {
  return (theme.vars ?? theme).palette;
}

function corDoDia(theme: Theme, bloqueado: boolean) {
  const palette = paletaDoTema(theme);
  return bloqueado ? palette.text.disabled : palette.text.primary;
}

export function SeletorPeriodo({
  id,
  modo,
  valor,
  max,
  min,
  atual,
  disabled,
  rotuloAcessivel,
  rotulo,
  detalhe,
  mostrarSelo = true,
  semDomingo = false,
  calendarioSemanal = false,
  onAbertoChange,
  aoHoje,
  hojeAtivo = false,
  onValor,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null);
  const semanal = calendarioSemanal && !semDomingo;
  // Sem valor, o painel abre no dia de referência, mas nenhum dia fica marcado.
  const corrente = atual ?? max;
  const inicial = valor || corrente;
  const [mesVisivel, setMesVisivel] = useState(() => inicial.slice(0, 7));
  const [anoVisivel, setAnoVisivel] = useState(() => inicial.slice(0, 4));
  const [foco, setFoco] = useState(inicial);
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const focoPendente = useRef(false);
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const portal = useRef<HTMLDivElement | null>(null);

  // O popover usa um contêiner próprio no body para não esconder o restante da
  // tela do leitor de tela, já que este seletor é não modal.
  useEffect(() => {
    return () => {
      portal.current?.remove();
      portal.current = null;
    };
  }, []);

  // Sem domingo, a grade e o limite ignoram o dia: se o máximo é domingo,
  // o último dia escolhível continua sendo o sábado. O atalho Hoje não faz
  // esse salto quando a tela trata o domingo à parte.
  const aprumar = (dia: string) => (semDomingo ? ultimoDiaDeChamada(dia) : dia);
  const hojeNoDomingoSemAcao =
    modo === "dia" && semDomingo && diaDaSemanaIso(corrente) === 7 && !aoHoje;
  const hojeDesabilitado =
    hojeNoDomingoSemAcao || (aoHoje ? hojeAtivo : valor === aprumar(corrente));
  const limite = aprumar(max);
  const piso = min ? aprumar(min) : null;
  const referencia = aprumar((valor || corrente) > max ? max : valor || corrente);
  const selo = mostrarSelo && valor === corrente ? (modo === "dia" ? "Hoje" : "Este mês") : "";
  const diaDaSemana = DIAS.find(
    ([nome]) => detalhe === nome || detalhe === nome.replace("-feira", ""),
  );

  useEffect(() => {
    if (!aberto) return;
    botoes.current.get(foco)?.focus();
  }, [aberto, foco]);

  useEffect(() => {
    onAbertoChange?.(aberto);
  }, [aberto, onAbertoChange]);

  // O popover do MUI é modal por padrão. Aqui ele é não modal: o clique e o
  // foco fora fecham o painel sem devolver o foco, como o restante da tela.
  useEffect(() => {
    if (!aberto) return;
    function foraDoPainel(alvo: EventTarget | null): boolean {
      if (!(alvo instanceof Element)) return true;
      const dentroDoPainel = alvo.closest("[data-seletor-periodo-painel]") !== null;
      return !(dentroDoPainel || gatilho.current?.contains(alvo));
    }
    function aoApontar(evento: PointerEvent) {
      if (foraDoPainel(evento.target)) setAberto(false);
    }
    function aoFocar(evento: FocusEvent) {
      if (foraDoPainel(evento.target)) setAberto(false);
    }
    document.addEventListener("pointerdown", aoApontar, true);
    document.addEventListener("focusin", aoFocar, true);
    return () => {
      document.removeEventListener("pointerdown", aoApontar, true);
      document.removeEventListener("focusin", aoFocar, true);
    };
  }, [aberto]);

  function registrar(chave: string, elemento: HTMLButtonElement | null) {
    if (!elemento) {
      botoes.current.delete(chave);
      return;
    }
    botoes.current.set(chave, elemento);
    // O painel monta depois do efeito; o foco inicial sai daqui.
    if (focoPendente.current && chave === foco) {
      focoPendente.current = false;
      elemento.focus();
    }
  }

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    if (devolverFoco) gatilho.current?.focus();
  }

  function alternar(evento: MouseEvent<HTMLButtonElement>) {
    if (aberto) {
      setAberto(false);
      return;
    }
    if (!portal.current) {
      const elemento = document.createElement("div");
      elemento.dataset.seletorPeriodoPortal = "true";
      document.body.appendChild(elemento);
      portal.current = elemento;
    }
    focoPendente.current = true;
    setAncora(evento.currentTarget);
    setMesVisivel(referencia.slice(0, 7));
    setAnoVisivel(referencia.slice(0, 4));
    setFoco(referencia);
    setAberto(true);
  }

  function escolher(proximo: string) {
    if (piso && proximo < piso) return;
    onValor(proximo);
    fechar(true);
  }

  function aoTeclarDia(evento: KeyboardEvent<HTMLElement>) {
    let proximo: string | null = null;
    if (evento.key === "ArrowLeft")
      proximo = semDomingo ? diaDeChamadaVizinho(foco, -1) : diaSeguinte(foco, -1);
    else if (evento.key === "ArrowRight")
      proximo = semDomingo ? diaDeChamadaVizinho(foco, 1) : diaSeguinte(foco, 1);
    else if (evento.key === "ArrowUp") proximo = diaSeguinte(foco, -7);
    else if (evento.key === "ArrowDown") proximo = diaSeguinte(foco, 7);
    else if (evento.key === "PageUp") proximo = mesmoDiaNoMes(foco, -1);
    else if (evento.key === "PageDown") proximo = mesmoDiaNoMes(foco, 1);
    else if (evento.key === "Home")
      proximo =
        semDomingo || semanal
          ? diaSeguinte(foco, 1 - diaDaSemanaIso(foco))
          : diaSeguinte(foco, -(diaDaSemanaIso(foco) % 7));
    else if (evento.key === "End")
      proximo = semDomingo
        ? diaSeguinte(foco, 6 - diaDaSemanaIso(foco))
        : semanal
          ? diaSeguinte(foco, 7 - diaDaSemanaIso(foco))
          : diaSeguinte(foco, 6 - (diaDaSemanaIso(foco) % 7));
    else return;
    evento.preventDefault();
    proximo = aprumar(proximo);
    // O foco nunca para num domingo futuro desabilitado: recua para o sábado.
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    if (proximo > limite) proximo = limite;
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    if (piso && proximo < piso) proximo = piso;
    setFoco(proximo);
    setMesVisivel(proximo.slice(0, 7));
  }

  function aoTeclarMes(evento: KeyboardEvent<HTMLElement>) {
    const indice = Number(foco.slice(5)) - 1;
    let proximoIndice: number | null = null;
    if (evento.key === "ArrowLeft") proximoIndice = indice - 1;
    else if (evento.key === "ArrowRight") proximoIndice = indice + 1;
    else if (evento.key === "ArrowUp") proximoIndice = indice - 3;
    else if (evento.key === "ArrowDown") proximoIndice = indice + 3;
    else if (evento.key === "Home") proximoIndice = 0;
    else if (evento.key === "End") proximoIndice = 11;
    else return;
    evento.preventDefault();
    if (proximoIndice < 0 || proximoIndice > 11) return;
    let proximo = `${anoVisivel}-${String(proximoIndice + 1).padStart(2, "0")}`;
    if (proximo > max) proximo = max;
    if (piso && proximo < piso.slice(0, 7)) proximo = piso.slice(0, 7);
    setFoco(proximo);
    setAnoVisivel(proximo.slice(0, 4));
  }

  function mudarMes(deslocamento: number) {
    const proximoMes = mesSeguinte(mesVisivel, deslocamento);
    setMesVisivel(proximoMes);
    const ultimo = diasDoMes(proximoMes).length;
    const numero = Math.min(Number(foco.slice(8)), ultimo);
    let proximo = aprumar(`${proximoMes}-${String(numero).padStart(2, "0")}`);
    if (piso && proximo < piso) proximo = piso;
    if (proximo > limite) proximo = limite;
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    setFoco(proximo);
  }

  function mudarAno(deslocamento: number) {
    const proximoAno = String(Number(anoVisivel) + deslocamento);
    let proximo = `${proximoAno}-${foco.slice(5)}`;
    setAnoVisivel(proximoAno);
    if (piso && proximo < piso) proximo = piso;
    if (proximo > limite) proximo = limite;
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    setFoco(proximo);
  }

  function estilosCelula(
    theme: Theme,
    selecionado: boolean,
    bloqueado: boolean,
    noDiaAtual: boolean,
    foraDoMes: boolean,
    domingoResumo: boolean,
  ) {
    const palette = paletaDoTema(theme);
    const base = {
      position: "relative",
      aspectRatio: "1 / 1",
      width: "100%",
      minWidth: 0,
      minHeight: ALTURA_CELULA,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid transparent",
      borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
      backgroundColor: "transparent",
      color: corDoDia(theme, bloqueado),
      fontSize: theme.typography.body2.fontSize ?? "0.875rem",
      fontWeight: selecionado || noDiaAtual ? 600 : 400,
      lineHeight: 1,
      transition: theme.transitions.create(["background-color", "border-color", "color"], {
        duration: 100,
      }),
      "&:hover": bloqueado ? {} : { backgroundColor: palette.action.hover },
      "&.Mui-focusVisible": {
        outline: `${TOKENS_LAYOUT.campo.foco}px solid ${palette.primary.main}`,
        outlineOffset: 2,
      },
      "&.Mui-disabled": { color: palette.text.disabled, opacity: 1 },
    };
    return {
      ...base,
      ...(foraDoMes && !selecionado && !noDiaAtual && { color: palette.text.secondary }),
      ...(domingoResumo &&
        !selecionado && {
          backgroundColor: palette.action.selected,
        }),
      ...(!selecionado &&
        noDiaAtual && {
          borderColor: palette.primary.main,
          backgroundColor: palette.action.selected,
          color: palette.text.primary,
        }),
      ...(selecionado && {
        borderColor: palette.primary.main,
        backgroundColor: palette.primary.main,
        color: palette.primary.contrastText,
        "&:hover": { backgroundColor: palette.primary.dark },
      }),
    };
  }

  function estilosMes(theme: Theme, selecionado: boolean, bloqueado: boolean, noMesAtual: boolean) {
    const palette = paletaDoTema(theme);
    return {
      width: "100%",
      minHeight: ALTURA_CELULA,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid transparent",
      borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
      backgroundColor: "transparent",
      color: corDoDia(theme, bloqueado),
      fontSize: theme.typography.body2.fontSize ?? "0.875rem",
      fontWeight: selecionado || noMesAtual ? 600 : 400,
      transition: theme.transitions.create(["background-color", "border-color", "color"], {
        duration: 100,
      }),
      "&:hover": bloqueado ? {} : { backgroundColor: palette.action.hover },
      "&.Mui-focusVisible": {
        outline: `${TOKENS_LAYOUT.campo.foco}px solid ${palette.primary.main}`,
        outlineOffset: 2,
      },
      "&.Mui-disabled": { color: palette.text.disabled, opacity: 1 },
      ...(!selecionado &&
        noMesAtual && {
          borderColor: palette.primary.main,
          backgroundColor: palette.action.selected,
          color: palette.text.primary,
        }),
      ...(selecionado && {
        borderColor: palette.primary.main,
        backgroundColor: palette.primary.main,
        color: palette.primary.contrastText,
        "&:hover": { backgroundColor: palette.primary.dark },
      }),
    };
  }

  const semanaVisivel = semDomingo
    ? SEMANAS_SEM_DOMINGO
    : semanal
      ? SEMANAS_SEGUNDA_DOMINGO
      : SEMANAS;
  const celulas = semanal
    ? celulasDoMesSegundaDomingo(mesVisivel)
    : semDomingo
      ? celulasDoMesSemDomingo(mesVisivel)
      : celulasDoMes(mesVisivel);

  const painel = (
    <Stack data-seletor-periodo-painel="true" spacing={1.5} sx={{ p: 1.5 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <IconButton
          type="button"
          size="small"
          aria-label={modo === "dia" ? "Mês anterior" : "Ano anterior"}
          onClick={() => (modo === "dia" ? mudarMes(-1) : mudarAno(-1))}
          sx={ALVO_TOQUE}
        >
          <ChevronLeftRoundedIcon fontSize="small" />
        </IconButton>
        <Typography
          component="p"
          variant="body2"
          aria-live="polite"
          sx={{ fontWeight: 600, textAlign: "center" }}
        >
          {modo === "dia" ? rotuloMes(mesVisivel) : anoVisivel}
        </Typography>
        <IconButton
          type="button"
          size="small"
          aria-label={modo === "dia" ? "Mês seguinte" : "Ano seguinte"}
          disabled={modo === "dia" ? mesVisivel >= max.slice(0, 7) : anoVisivel >= max.slice(0, 4)}
          onClick={() => (modo === "dia" ? mudarMes(1) : mudarAno(1))}
          sx={ALVO_TOQUE}
        >
          <ChevronRightRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      {modo === "dia" ? (
        <Stack
          role="group"
          aria-label={`Dias de ${rotuloMes(mesVisivel)}`}
          spacing={0.5}
          onKeyDown={aoTeclarDia}
        >
          <Box
            aria-hidden="true"
            sx={{ display: "grid", gridTemplateColumns: colunas(semDomingo), gap: 0.5 }}
          >
            {semanaVisivel.map((letra, indice) => {
              const domingoResumo = semanal && indice === 6;
              return (
                <Box
                  key={`${letra}-${indice}`}
                  component="span"
                  sx={{
                    display: "flex",
                    width: "100%",
                    height: semanal ? 36 : 28,
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.25,
                    color: "text.secondary",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  <Box component="span">{letra}</Box>
                  {domingoResumo && (
                    <Box
                      component="span"
                      sx={{
                        color: "primary.main",
                        fontSize: 9,
                        fontWeight: 600,
                        lineHeight: 1,
                      }}
                    >
                      Resumo
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: colunas(semDomingo), gap: 0.5 }}>
            {celulas.map((dia, indice) => {
              if (!dia)
                return (
                  <Box key={`vazio-${indice}`} aria-hidden="true" sx={{ aspectRatio: "1 / 1" }} />
                );
              const selecionado = dia === valor;
              const futuro = dia > max;
              const domingoResumo = semanal && ehDomingo(dia);
              const domingoFuturo = domingoResumo && dia > corrente;
              const bloqueado = futuro || domingoFuturo || Boolean(piso && dia < piso);
              const foraDoMes = semanal && dia.slice(0, 7) !== mesVisivel;
              const noDiaAtual = dia === corrente;
              const numero = Number(dia.slice(8));
              return (
                <ButtonBase
                  key={dia}
                  ref={(elemento) => registrar(dia, elemento)}
                  type="button"
                  tabIndex={dia === foco ? 0 : -1}
                  disabled={bloqueado}
                  aria-pressed={selecionado}
                  aria-label={`${numero} de ${nomeDoMes(dia.slice(0, 7)).toLowerCase()} de ${dia.slice(0, 4)}${domingoResumo ? ", resumo da semana anterior" : ""}${noDiaAtual ? ", hoje" : ""}${selecionado ? ", selecionado" : ""}`}
                  onClick={() => escolher(dia)}
                  data-dia={dia}
                  data-fora-do-mes={foraDoMes ? "true" : undefined}
                  data-domingo-resumo={domingoResumo ? "true" : undefined}
                  sx={(theme) =>
                    estilosCelula(
                      theme,
                      selecionado,
                      bloqueado,
                      noDiaAtual,
                      foraDoMes,
                      domingoResumo,
                    )
                  }
                >
                  {numero}
                  {domingoResumo && (
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        position: "absolute",
                        bottom: 6,
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        backgroundColor: bloqueado ? "text.disabled" : "primary.main",
                      }}
                    />
                  )}
                </ButtonBase>
              );
            })}
          </Box>
          {semanal && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Domingos, na última coluna, abrem o resumo da semana anterior.
            </Typography>
          )}
        </Stack>
      ) : (
        <Box
          role="group"
          aria-label={`Meses de ${anoVisivel}`}
          onKeyDown={aoTeclarMes}
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 0.5,
          }}
        >
          {MESES.map((numero) => {
            const mes = `${anoVisivel}-${String(numero).padStart(2, "0")}`;
            const selecionado = mes === valor;
            const futuro = mes > max;
            const bloqueado = futuro || Boolean(piso && mes < piso.slice(0, 7));
            const noMesAtual = mes === corrente;
            return (
              <ButtonBase
                key={mes}
                ref={(elemento) => registrar(mes, elemento)}
                type="button"
                tabIndex={mes === foco ? 0 : -1}
                disabled={bloqueado}
                aria-pressed={selecionado}
                onClick={() => escolher(mes)}
                sx={(theme) => estilosMes(theme, selecionado, bloqueado, noMesAtual)}
              >
                {nomeDoMes(mes)}
              </ButtonBase>
            );
          })}
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: 1,
          borderColor: "divider",
          pt: 1.5,
        }}
      >
        <ButtonBase
          type="button"
          disabled={hojeDesabilitado}
          onClick={() => {
            if (hojeDesabilitado) return;
            if (aoHoje) {
              aoHoje();
              fechar(true);
              return;
            }
            escolher(aprumar(corrente));
          }}
          sx={(theme) => ({
            minHeight: ALTURA_GATILHO,
            px: 1.5,
            borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
            color: paletaDoTema(theme).primary.main,
            fontSize: theme.typography.body2.fontSize ?? "0.875rem",
            fontWeight: 600,
            "&:hover": { backgroundColor: paletaDoTema(theme).action.hover },
            "&.Mui-disabled": { color: paletaDoTema(theme).text.disabled, opacity: 1 },
          })}
        >
          {modo === "dia" ? "Hoje" : "Este mês"}
        </ButtonBase>
        <ButtonBase
          type="button"
          onClick={() => fechar(true)}
          sx={(theme) => ({
            minHeight: ALTURA_GATILHO,
            px: 1.5,
            borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
            color: paletaDoTema(theme).text.secondary,
            fontSize: theme.typography.body2.fontSize ?? "0.875rem",
            "&:hover": {
              color: paletaDoTema(theme).text.primary,
              backgroundColor: paletaDoTema(theme).action.hover,
            },
          })}
        >
          Fechar
        </ButtonBase>
      </Stack>
    </Stack>
  );

  const conteudoGatilho: ReactNode = (
    <>
      <CalendarMonthRoundedIcon
        aria-hidden="true"
        sx={{
          display: { "@": "none", "@176": "block" },
          flexShrink: 0,
          fontSize: 18,
          color: "inherit",
          opacity: 0.8,
        }}
      />
      <Box
        component="span"
        className="numerais-tabulares"
        sx={{
          maxWidth: "100%",
          minWidth: 0,
          flexShrink: 0,
          fontWeight: 600,
          overflowWrap: "anywhere",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rotulo}
      </Box>
      {detalhe && (
        <Box
          component="span"
          className="detalhe-data"
          data-detalhe="true"
          sx={{
            maxWidth: "100%",
            minWidth: 0,
            flexShrink: 0,
            color: "text.secondary",
            overflowWrap: "anywhere",
          }}
        >
          {diaDaSemana ? (
            <>
              <Box component="span" sx={{ display: { "@224": "none" } }}>
                {diaDaSemana[1]}
              </Box>
              <Box component="span" sx={{ display: { "@": "none", "@224": "inline" } }}>
                {detalhe}
              </Box>
            </>
          ) : (
            detalhe
          )}
        </Box>
      )}
      {selo && (
        <Chip
          data-selo="true"
          label={selo}
          color="primary"
          size="small"
          sx={{
            maxWidth: "100%",
            height: 24,
            flexShrink: 0,
            "& .MuiChip-label": { px: 1, fontSize: 11 },
          }}
        />
      )}
    </>
  );

  return (
    <>
      <ButtonBase
        ref={gatilho}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`${rotuloAcessivel}: ${rotulo}${diaDaSemana ? `, ${diaDaSemana[0]}` : ""}${selo ? `, ${selo}` : ""}`}
        onClick={alternar}
        sx={(theme) => ({
          containerType: "inline-size",
          display: "flex",
          width: "100%",
          minHeight: ALTURA_GATILHO,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          columnGap: 1,
          rowGap: 0,
          px: 1.5,
          py: 0.5,
          border: `1px solid ${paletaDoTema(theme).divider}`,
          borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
          backgroundColor: paletaDoTema(theme).background.paper,
          color: paletaDoTema(theme).text.primary,
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.body2.fontSize ?? "0.875rem",
          fontWeight: 500,
          transition: theme.transitions.create(["background-color", "border-color", "color"], {
            duration: 100,
          }),
          "&:hover": {
            backgroundColor: paletaDoTema(theme).action.hover,
            borderColor: paletaDoTema(theme).grey[400],
          },
          "&.Mui-focusVisible": {
            outline: `${TOKENS_LAYOUT.campo.foco}px solid ${paletaDoTema(theme).primary.main}`,
            outlineOffset: 2,
          },
          "&.Mui-disabled": {
            color: paletaDoTema(theme).text.disabled,
            cursor: "not-allowed",
            opacity: 0.7,
          },
        })}
      >
        {conteudoGatilho}
      </ButtonBase>

      <Popover
        open={aberto}
        anchorEl={ancora}
        container={() => portal.current}
        onClose={(_evento, motivo) => fechar(motivo === "escapeKeyDown")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        marginThreshold={8}
        hideBackdrop
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        disableScrollLock
        slotProps={{
          root: { sx: { pointerEvents: "none" } },
          paper: {
            role: "dialog",
            "aria-label": rotuloAcessivel,
            sx: (theme) => ({
              width: LARGURA_PAINEL,
              maxWidth: "calc(100vw - 32px)",
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              pointerEvents: "auto",
              borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
              border: `1px solid ${paletaDoTema(theme).divider}`,
              backgroundImage: "none",
              boxShadow: theme.shadows[1],
            }),
          },
        }}
      >
        {painel}
      </Popover>
    </>
  );
}
