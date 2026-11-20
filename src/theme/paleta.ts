// Escalas e tokens de cor do tema: verde institucional, cinzas e as cores
// semânticas de falta, falta justificada e alerta, em HSL.
import type { ColorSystemOptions, Theme } from "@mui/material/styles";

export interface CorSemantica {
  light: string;
  main: string;
  dark: string;
  contrastText: string;
  /** Fundo suave para faixas, selos e estados selecionados. */
  fraco: string;
  /** Texto legível sobre o fundo suave ou sobre a superfície. */
  texto: string;
}

export interface CorSemanticaOptions {
  light?: string;
  main?: string;
  dark?: string;
  contrastText?: string;
  fraco?: string;
  texto?: string;
}

declare module "@mui/material/styles" {
  interface CssThemeVariables {
    enabled: true;
  }

  interface Palette {
    baseShadow: string;
    falta: CorSemantica;
    justificada: CorSemantica;
    alerta: CorSemantica;
  }

  interface PaletteOptions {
    baseShadow?: string;
    falta?: CorSemanticaOptions;
    justificada?: CorSemanticaOptions;
    alerta?: CorSemanticaOptions;
  }
}

/** Verde institucional com a matiz do FrequenciApp. */
export const brand = {
  50: "hsl(158, 55%, 96%)",
  100: "hsl(158, 50%, 92%)",
  200: "hsl(158, 45%, 82%)",
  300: "hsl(158, 45%, 66%)",
  400: "hsl(158, 50%, 49%)",
  500: "hsl(158, 55%, 42%)",
  600: "hsl(158, 55%, 35%)",
  700: "hsl(158, 60%, 28%)",
  800: "hsl(158, 65%, 18%)",
  900: "hsl(158, 70%, 10%)",
} as const;

/** Cinza grafite do template, usado em texto, bordas e botões neutros. */
export const cinza = {
  50: "hsl(220, 35%, 97%)",
  100: "hsl(220, 30%, 94%)",
  200: "hsl(220, 20%, 88%)",
  300: "hsl(220, 20%, 80%)",
  400: "hsl(220, 20%, 65%)",
  500: "hsl(220, 20%, 42%)",
  600: "hsl(220, 20%, 35%)",
  700: "hsl(220, 20%, 25%)",
  800: "hsl(220, 30%, 6%)",
  900: "hsl(220, 35%, 3%)",
} as const;

/** Azul da informação e da falta justificada, separado do verde da marca. */
export const azul = {
  50: "hsl(210, 100%, 97%)",
  100: "hsl(210, 100%, 92%)",
  200: "hsl(210, 100%, 84%)",
  300: "hsl(210, 90%, 72%)",
  400: "hsl(210, 80%, 60%)",
  500: "hsl(210, 70%, 50%)",
  600: "hsl(210, 65%, 42%)",
  700: "hsl(210, 70%, 34%)",
  800: "hsl(210, 75%, 25%)",
  900: "hsl(210, 80%, 16%)",
} as const;

/** Âmbar do alerta e do aviso. */
export const laranja = {
  50: "hsl(45, 100%, 97%)",
  100: "hsl(45, 92%, 90%)",
  200: "hsl(45, 94%, 80%)",
  300: "hsl(45, 90%, 65%)",
  400: "hsl(45, 90%, 40%)",
  500: "hsl(45, 90%, 35%)",
  600: "hsl(45, 91%, 25%)",
  700: "hsl(45, 94%, 20%)",
  800: "hsl(45, 95%, 16%)",
  900: "hsl(45, 93%, 12%)",
} as const;

/** Vermelho da falta e do erro. */
export const vermelho = {
  50: "hsl(0, 100%, 97%)",
  100: "hsl(0, 92%, 90%)",
  200: "hsl(0, 94%, 80%)",
  300: "hsl(0, 90%, 65%)",
  400: "hsl(0, 90%, 40%)",
  500: "hsl(0, 90%, 30%)",
  600: "hsl(0, 91%, 25%)",
  700: "hsl(0, 94%, 18%)",
  800: "hsl(0, 95%, 12%)",
  900: "hsl(0, 93%, 6%)",
} as const;

/** Verde de sucesso do template, distinguível do verde da marca. */
export const verde = {
  50: "hsl(120, 80%, 98%)",
  100: "hsl(120, 75%, 94%)",
  200: "hsl(120, 75%, 87%)",
  300: "hsl(120, 61%, 77%)",
  400: "hsl(120, 44%, 53%)",
  500: "hsl(120, 59%, 30%)",
  600: "hsl(120, 70%, 25%)",
  700: "hsl(120, 75%, 16%)",
  800: "hsl(120, 84%, 10%)",
  900: "hsl(120, 87%, 6%)",
} as const;

/** Cores de série dos gráficos, derivadas da paleta do tema ativo. */
export function coresGrafico(tema: Theme): string[] {
  const { palette } = tema.vars;
  return [
    palette.primary.main,
    palette.falta.main,
    palette.justificada.main,
    palette.alerta.main,
    palette.success.main,
    palette.info.main,
  ];
}

/** Cores de navegador equivalentes ao fundo padrão de cada esquema. */
export const CORES_NAVEGADOR = {
  claro: "#fcfcfc",
  escuro: "#05070a",
} as const;

export const colorSchemes: Record<"light" | "dark", ColorSystemOptions> = {
  light: {
    palette: {
      primary: {
        light: brand[500],
        main: brand[700],
        dark: brand[900],
        contrastText: brand[50],
      },
      secondary: {
        light: brand[500],
        main: brand[700],
        dark: brand[900],
        contrastText: brand[50],
      },
      info: {
        light: azul[300],
        main: azul[600],
        dark: azul[800],
        contrastText: cinza[50],
      },
      warning: {
        light: laranja[300],
        main: laranja[500],
        dark: laranja[800],
        contrastText: cinza[900],
      },
      error: {
        light: vermelho[300],
        main: vermelho[400],
        dark: vermelho[800],
        contrastText: cinza[50],
      },
      success: {
        light: verde[300],
        main: verde[400],
        dark: verde[800],
        contrastText: cinza[900],
      },
      grey: {
        ...cinza,
      },
      divider: "hsla(220, 20%, 80%, 0.4)",
      background: {
        default: "hsl(0, 0%, 99%)",
        paper: cinza[50],
      },
      text: {
        primary: cinza[800],
        secondary: cinza[600],
      },
      action: {
        hover: "hsla(220, 30%, 94%, 0.2)",
        selected: "hsla(220, 30%, 94%, 0.3)",
      },
      baseShadow:
        "hsla(220, 30%, 5%, 0.07) 0px 4px 16px 0px, hsla(220, 25%, 10%, 0.07) 0px 8px 16px -5px",
      falta: {
        light: vermelho[300],
        main: vermelho[500],
        dark: vermelho[800],
        contrastText: cinza[50],
        fraco: vermelho[50],
        texto: vermelho[700],
      },
      justificada: {
        light: azul[300],
        main: azul[600],
        dark: azul[800],
        contrastText: cinza[50],
        fraco: azul[50],
        texto: azul[700],
      },
      alerta: {
        light: laranja[300],
        main: laranja[500],
        dark: laranja[800],
        contrastText: cinza[900],
        fraco: laranja[50],
        texto: laranja[700],
      },
    },
  },
  dark: {
    palette: {
      primary: {
        light: brand[300],
        main: brand[400],
        dark: brand[700],
        contrastText: brand[900],
      },
      secondary: {
        light: brand[200],
        main: brand[300],
        dark: brand[500],
        contrastText: brand[900],
      },
      info: {
        light: azul[200],
        main: azul[300],
        dark: azul[600],
        contrastText: azul[900],
      },
      warning: {
        light: laranja[200],
        main: laranja[300],
        dark: laranja[600],
        contrastText: cinza[900],
      },
      error: {
        light: vermelho[300],
        main: vermelho[500],
        dark: vermelho[700],
        contrastText: cinza[50],
      },
      success: {
        light: verde[200],
        main: verde[300],
        dark: verde[700],
        contrastText: cinza[900],
      },
      grey: {
        ...cinza,
      },
      divider: "hsla(220, 20%, 25%, 0.6)",
      background: {
        default: cinza[900],
        paper: "hsl(220, 30%, 7%)",
      },
      text: {
        primary: "hsl(0, 0%, 100%)",
        secondary: cinza[400],
      },
      action: {
        hover: "hsla(220, 20%, 35%, 0.2)",
        selected: "hsla(220, 20%, 35%, 0.3)",
      },
      baseShadow:
        "hsla(220, 30%, 5%, 0.7) 0px 4px 16px 0px, hsla(220, 25%, 10%, 0.8) 0px 8px 16px -5px",
      falta: {
        light: vermelho[200],
        main: vermelho[300],
        dark: vermelho[700],
        contrastText: cinza[900],
        fraco: vermelho[900],
        texto: vermelho[200],
      },
      justificada: {
        light: azul[200],
        main: azul[300],
        dark: azul[600],
        contrastText: azul[900],
        fraco: azul[900],
        texto: azul[200],
      },
      alerta: {
        light: laranja[200],
        main: laranja[300],
        dark: laranja[600],
        contrastText: cinza[900],
        fraco: laranja[900],
        texto: laranja[200],
      },
    },
  },
};
