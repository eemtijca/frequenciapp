"use client";

// Botões do Material UI com hierarquia de ações, tamanhos do tema e alvo de toque.
import type { MouseEventHandler, ReactNode } from "react";
import NextLink from "next/link";
import Button, { type ButtonProps } from "@mui/material/Button";
import IconButton, { type IconButtonProps } from "@mui/material/IconButton";
import type { SxProps, Theme } from "@mui/material/styles";
import { TOKENS_LAYOUT } from "@/theme/layout";

export type VarianteBotao = "primario" | "secundario" | "contorno" | "texto" | "destrutivo";
export type TamanhoBotao = "pequeno" | "medio";

const VARIANTES = {
  primario: { variant: "contained", color: "primary" },
  secundario: { variant: "contained", color: "secondary" },
  contorno: { variant: "outlined", color: "primary" },
  texto: { variant: "text", color: "primary" },
  destrutivo: { variant: "contained", color: "error" },
} as const satisfies Record<VarianteBotao, Pick<ButtonProps, "variant" | "color">>;

const TAMANHOS = {
  pequeno: "small",
  medio: "medium",
} as const satisfies Record<TamanhoBotao, "small" | "medium">;

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

type Acao =
  | { href: string; onClick?: never }
  | { href?: undefined; onClick?: MouseEventHandler<HTMLButtonElement> };

type PropsBase = Omit<
  ButtonProps,
  | "variant"
  | "color"
  | "size"
  | "href"
  | "onClick"
  | "loading"
  | "startIcon"
  | "endIcon"
  | "component"
  | "className"
>;

export type BotaoProps = PropsBase &
  Acao & {
    variante?: VarianteBotao;
    tamanho?: TamanhoBotao;
    carregando?: boolean;
    icone?: ReactNode;
  };

function combinarSx(base: SxProps<Theme>, extra: SxProps<Theme> | undefined): SxProps<Theme> {
  return [base, ...(Array.isArray(extra) ? extra : [extra])];
}

/** Botão com a hierarquia de ações do tema: grafite, verde, contorno, texto ou destrutivo. */
export function Botao({
  variante = "primario",
  tamanho = "medio",
  carregando = false,
  icone,
  href,
  onClick,
  disabled,
  sx,
  children,
  ...props
}: BotaoProps) {
  const desabilitado = disabled === true || carregando;
  const usaLink = href !== undefined && !desabilitado;

  return (
    <Button
      {...VARIANTES[variante]}
      size={TAMANHOS[tamanho]}
      component={usaLink ? NextLink : "button"}
      href={usaLink ? href : undefined}
      onClick={usaLink ? undefined : onClick}
      disabled={desabilitado}
      loading={carregando}
      loadingPosition={icone ? "start" : "center"}
      startIcon={carregando ? undefined : icone}
      aria-busy={carregando || undefined}
      sx={combinarSx({ height: TOKENS_LAYOUT.botao[tamanho], ...ALVO_TOQUE }, sx)}
      {...props}
    >
      {children}
    </Button>
  );
}

function estilosIcone(theme: Theme, variante: VarianteBotao) {
  const { palette } = theme.vars;

  switch (variante) {
    case "primario":
      return {
        color: palette.grey[50],
        backgroundColor: palette.grey[900],
        borderColor: palette.grey[700],
        "&:hover": {
          backgroundColor: palette.grey[800],
          borderColor: palette.grey[600],
        },
        ...theme.applyStyles("dark", {
          color: palette.grey[900],
          backgroundColor: palette.grey[50],
          borderColor: palette.grey[100],
          "&:hover": {
            backgroundColor: palette.grey[200],
            borderColor: palette.grey[300],
          },
        }),
      };
    case "secundario":
      return {
        color: palette.secondary.contrastText,
        backgroundColor: palette.secondary.main,
        borderColor: palette.secondary.main,
        "&:hover": {
          backgroundColor: palette.secondary.dark,
          borderColor: palette.secondary.dark,
        },
      };
    case "destrutivo":
      return {
        color: palette.error.contrastText,
        backgroundColor: palette.error.main,
        borderColor: palette.error.main,
        "&:hover": {
          backgroundColor: palette.error.dark,
          borderColor: palette.error.dark,
        },
      };
    case "texto":
      return {
        color: palette.text.secondary,
        backgroundColor: "transparent",
        borderColor: "transparent",
        "&:hover": {
          backgroundColor: palette.action.hover,
          borderColor: "transparent",
        },
      };
    case "contorno":
    default:
      return {};
  }
}

type PropsIconeBase = Omit<
  IconButtonProps,
  "color" | "size" | "href" | "onClick" | "loading" | "children" | "component" | "className"
>;

export type BotaoIconeProps = PropsIconeBase &
  Acao & {
    rotulo: string;
    icone: ReactNode;
    variante?: VarianteBotao;
    tamanho?: TamanhoBotao;
    carregando?: boolean;
  };

/** Botão apenas com ícone, sempre com rótulo acessível e área de toque de 48 dp. */
export function BotaoIcone({
  rotulo,
  icone,
  variante = "contorno",
  tamanho = "medio",
  carregando = false,
  href,
  onClick,
  disabled,
  sx,
  ...props
}: BotaoIconeProps) {
  const desabilitado = disabled === true || carregando;
  const usaLink = href !== undefined && !desabilitado;

  return (
    <IconButton
      aria-label={rotulo}
      aria-busy={carregando || undefined}
      size={TAMANHOS[tamanho]}
      component={usaLink ? NextLink : "button"}
      href={usaLink ? href : undefined}
      onClick={usaLink ? undefined : onClick}
      disabled={desabilitado}
      loading={carregando}
      sx={combinarSx(
        [
          {
            width: TOKENS_LAYOUT.botao[tamanho],
            height: TOKENS_LAYOUT.botao[tamanho],
            ...ALVO_TOQUE,
          },
          (theme) => estilosIcone(theme, variante),
        ],
        sx,
      )}
      {...props}
    >
      {icone}
    </IconButton>
  );
}
