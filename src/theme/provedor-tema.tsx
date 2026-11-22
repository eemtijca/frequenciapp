"use client";

// Provedor do tema Material UI: cache do Emotion com camada e nonce, tema claro
// e escuro, estilos globais, localização pt-BR e cor da barra do navegador.
import { useEffect, type ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import "dayjs/locale/pt-br";
import { tema } from "./tema";
import { CorDoTema } from "./esquema-cores";
import { ContextoAnimacoes, usePreferenciaAnimacoes } from "./animacoes-da-interface";
import { ATRIBUTO_ANIMACOES } from "./preferencia-animacoes";

const temaSemMovimento: Theme = { ...tema, motion: { reducedMotion: "always" } };

// O seletor na raiz cobre conteúdo portado e vale antes da hidratação.
const estilosSemMovimento = {
  "&, *, *::before, *::after": {
    animationName: "none !important",
    transitionDuration: "0ms !important",
    transitionDelay: "0ms !important",
    scrollBehavior: "auto !important",
  },
  ".MuiLinearProgress-indeterminate .MuiLinearProgress-bar1, .MuiLinearProgress-query .MuiLinearProgress-bar1":
    {
      left: "30%",
      right: "auto",
      width: "40%",
    },
  ".MuiLinearProgress-indeterminate .MuiLinearProgress-bar2, .MuiLinearProgress-query .MuiLinearProgress-bar2":
    {
      display: "none",
    },
};

const estilosGlobais = (temaAtual: Theme) => ({
  ":root": {
    "--area-segura-superior": "env(safe-area-inset-top, 0px)",
    "--area-segura-inferior": "env(safe-area-inset-bottom, 0px)",
    "--area-segura-esquerda": "env(safe-area-inset-left, 0px)",
    "--area-segura-direita": "env(safe-area-inset-right, 0px)",
  },
  html: {
    WebkitTextSizeAdjust: "100%",
    textSizeAdjust: "100%",
  },
  body: {
    minHeight: "100dvh",
    paddingBottom: "var(--area-segura-inferior)",
    backgroundColor: temaAtual.vars.palette.background.default,
    color: temaAtual.vars.palette.text.primary,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },
  "::selection": {
    backgroundColor: temaAtual.vars.palette.primary.main,
    color: temaAtual.vars.palette.primary.contrastText,
  },
  ":focus-visible": {
    outline: `3px solid ${temaAtual.vars.palette.primary.main}`,
    outlineOffset: 2,
  },
  ".numerais-tabulares": {
    fontVariantNumeric: "tabular-nums",
  },
  ".sr-only": {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
  [`html[${ATRIBUTO_ANIMACOES}="desativadas"]`]: estilosSemMovimento,
  "@media (prefers-reduced-motion: reduce)": {
    [`html:not([${ATRIBUTO_ANIMACOES}="ativadas"])`]: estilosSemMovimento,
  },
  "@media (forced-colors: active)": {
    "*": {
      forcedColorAdjust: "auto",
    },
    ":focus-visible": {
      outline: "3px solid Highlight",
      outlineOffset: 2,
    },
    'html[data-foco-teclado="true"] :focus-visible': {
      outline: "3px solid Highlight",
      outlineOffset: 2,
    },
    ".MuiOutlinedInput-notchedOutline": {
      borderColor: "CanvasText",
    },
  },
  "@media print": {
    body: {
      backgroundColor: "#fff",
      color: "#000",
    },
    ".MuiAppBar-root, .MuiDrawer-root, .MuiSnackbar-root, .MuiDialog-root, [data-imprimir-ocultar]":
      {
        display: "none !important",
      },
    "a[href]": {
      color: "inherit",
      textDecoration: "underline",
    },
  },
});

export function ProvedorTema({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const animacoes = usePreferenciaAnimacoes();

  // Cores forçadas: o anel global perde para o outline zerado dos campos do MUI.
  // A modalidade de teclado restaura o foco visível sem contornar o autofoco por toque.
  useEffect(() => {
    const raiz = document.documentElement;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Tab") raiz.dataset.focoTeclado = "true";
    };
    const aoApontar = () => {
      delete raiz.dataset.focoTeclado;
    };
    window.addEventListener("keydown", aoTeclar, true);
    window.addEventListener("pointerdown", aoApontar, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("pointerdown", aoApontar, true);
    };
  }, []);

  return (
    <AppRouterCacheProvider options={{ nonce }}>
      <ThemeProvider
        theme={animacoes.hidratado && !animacoes.animacoesAtivas ? temaSemMovimento : tema}
        defaultMode="system"
        modeStorageKey="theme"
        disableTransitionOnChange
      >
        <CssBaseline enableColorScheme />
        <GlobalStyles styles={estilosGlobais} />
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          adapterLocale="pt-br"
          localeText={ptBR.components.MuiLocalizationProvider.defaultProps.localeText}
        >
          <ContextoAnimacoes.Provider value={animacoes}>
            {children}
            <CorDoTema />
          </ContextoAnimacoes.Provider>
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
