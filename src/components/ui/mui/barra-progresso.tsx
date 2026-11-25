// Barra de progresso determinada, com tom semântico e leitura acessível do valor.
import LinearProgress from "@mui/material/LinearProgress";
import type { SxProps, Theme } from "@mui/material/styles";

export type TomBarra = "primario" | "sucesso" | "alerta" | "falta" | "justificada" | "neutro";

function corDoTom(theme: Theme, tom: TomBarra): string {
  const { palette } = theme.vars;

  switch (tom) {
    case "sucesso":
      return palette.success.main;
    case "alerta":
      return palette.alerta.main;
    case "falta":
      return palette.falta.main;
    case "justificada":
      return palette.justificada.main;
    case "neutro":
      return palette.grey[400];
    case "primario":
    default:
      return palette.primary.main;
  }
}

export interface BarraProgressoProps {
  valor: number;
  max?: number;
  tom?: TomBarra;
  /** Nome acessível da barra, sempre obrigatório. */
  rotulo: string;
  /** Texto lido no lugar do percentual, por exemplo a contagem de alunos. */
  descricao?: string;
  descritoPor?: string;
  testId?: string;
  sx?: SxProps<Theme>;
}

/** Barra de 0 a 100 por cento, limitada ao intervalo e com aria-valuetext explícito. */
export function BarraProgresso({
  valor,
  max = 100,
  tom = "primario",
  rotulo,
  descricao,
  descritoPor,
  testId,
  sx,
}: BarraProgressoProps) {
  const percentual = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  const arredondado = Math.round(percentual);
  const texto = descricao?.trim() ? descricao : `${arredondado}%`;

  return (
    <LinearProgress
      variant="determinate"
      value={arredondado}
      aria-label={rotulo}
      aria-valuetext={texto}
      aria-describedby={descritoPor}
      data-testid={testId}
      sx={[
        (theme) => ({
          "& .MuiLinearProgress-bar": {
            backgroundColor: corDoTom(theme, tom),
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
