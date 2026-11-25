// Círculos de contagem e de valor com os tons de falta, falta justificada,
// saída e neutro, preservando a leitura por extenso para leitores de tela.
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import type { SxProps, Theme } from "@mui/material/styles";
import { numeraisTabulares } from "@/theme/tipografia";

export type TomCirculo = "falta" | "justificada" | "saida" | "neutro";

const TAMANHO_CONTAGEM = 32;
const TAMANHO_VALOR = 28;
const TAMANHO_FONTE = "0.6875rem";

function legendaDe(valor: number, singular: string, plural: string): string {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

function coresDoTom(
  theme: Theme,
  tom: TomCirculo,
  solido: boolean,
): { backgroundColor: string; color: string; borderColor: string } {
  const { palette } = theme.vars;

  if (tom === "falta") {
    return solido
      ? {
          backgroundColor: palette.falta.main,
          color: palette.falta.contrastText,
          borderColor: palette.falta.main,
        }
      : {
          backgroundColor: palette.falta.fraco,
          color: palette.falta.texto,
          borderColor: palette.falta.main,
        };
  }

  if (tom === "justificada") {
    return solido
      ? {
          backgroundColor: palette.justificada.main,
          color: palette.justificada.contrastText,
          borderColor: palette.justificada.main,
        }
      : {
          backgroundColor: palette.justificada.fraco,
          color: palette.justificada.texto,
          borderColor: palette.justificada.main,
        };
  }

  return {
    backgroundColor: palette.action.hover,
    color: palette.text.secondary,
    borderColor: palette.divider,
  };
}

export interface CirculoContagemProps {
  valor: number;
  sigla: string;
  tom: TomCirculo;
  singular: string;
  plural: string;
}

/** Um valor dentro de um círculo, com a sigla visível e o nome por extenso no leitor. */
export function CirculoContagem({ valor, sigla, tom, singular, plural }: CirculoContagemProps) {
  const legenda = legendaDe(valor, singular, plural);

  return (
    <Avatar
      component="span"
      role="img"
      title={legenda}
      aria-label={legenda}
      sx={[
        (theme) => ({
          width: TAMANHO_CONTAGEM,
          height: TAMANHO_CONTAGEM,
          minWidth: TAMANHO_CONTAGEM,
          fontSize: TAMANHO_FONTE,
          fontWeight: 600,
          lineHeight: 1,
          border: "1px solid",
          ...coresDoTom(theme, tom, false),
          ...numeraisTabulares,
        }),
      ]}
    >
      <span aria-hidden="true">
        {valor} {sigla}
      </span>
    </Avatar>
  );
}

export interface CirculoValorProps {
  /** Texto visível dentro do círculo, por exemplo 27 ou 35,5%. */
  texto: string;
  /** Leitura por extenso para leitores de tela, por exemplo 27 faltas. */
  rotulo: string;
  tom?: TomCirculo;
  sx?: SxProps<Theme>;
}

/** Um número isolado em círculo, com o tom sólido da falta ou o neutro. */
export function CirculoValor({ texto, rotulo, tom = "neutro", sx }: CirculoValorProps) {
  return (
    <Avatar
      component="span"
      role="img"
      title={rotulo}
      aria-label={rotulo}
      sx={[
        (theme) => ({
          width: TAMANHO_VALOR,
          height: TAMANHO_VALOR,
          minWidth: TAMANHO_VALOR,
          fontSize: TAMANHO_FONTE,
          fontWeight: 600,
          lineHeight: 1,
          border: "1px solid",
          ...coresDoTom(theme, tom, tom === "falta" || tom === "justificada"),
          ...numeraisTabulares,
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <span aria-hidden="true">{texto}</span>
    </Avatar>
  );
}

export interface CirculosAcumuladoProps {
  faltas: number;
  justificadas: number;
  saidas?: number;
}

/** Faltas e faltas justificadas lado a lado, com saídas quando o relatório pede. */
export function CirculosAcumulado({ faltas, justificadas, saidas }: CirculosAcumuladoProps) {
  return (
    <Stack
      component="span"
      direction="row"
      spacing={0.5}
      sx={{ display: "inline-flex", alignItems: "center" }}
    >
      <CirculoContagem valor={faltas} sigla="F" tom="falta" singular="falta" plural="faltas" />
      <CirculoContagem
        valor={justificadas}
        sigla="FJ"
        tom="justificada"
        singular="falta justificada"
        plural="faltas justificadas"
      />
      {saidas !== undefined ? (
        <CirculoContagem valor={saidas} sigla="S" tom="saida" singular="saída" plural="saídas" />
      ) : null}
    </Stack>
  );
}

/** Frase do acumulado para o nome acessível da linha do aluno. */
export function fraseAcumulado(faltas: number, justificadas: number): string {
  return `Acumulado: ${legendaDe(faltas, "falta", "faltas")} e ${legendaDe(
    justificadas,
    "falta justificada",
    "faltas justificadas",
  )}.`;
}
