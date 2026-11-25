// Cartão do Material UI com cabeçalho, título, conteúdo e ações, sem sombra,
// com padding de 16 px e raio de 8 px; as partes internas não criam outro cartão.
import Card, { type CardProps } from "@mui/material/Card";
import CardActions, { type CardActionsProps } from "@mui/material/CardActions";
import CardContent, { type CardContentProps } from "@mui/material/CardContent";
import Stack, { type StackProps } from "@mui/material/Stack";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import { TOKENS_LAYOUT } from "@/theme/layout";

export type CartaoProps = Omit<CardProps, "elevation" | "raised" | "className">;

/** Superfície única de conteúdo, sem sombra e com a medida do tema. */
export function Cartao({ sx, ...props }: CartaoProps) {
  return (
    <Card
      elevation={0}
      {...props}
      sx={[
        (theme) => ({
          padding: `${TOKENS_LAYOUT.cartao.padding}px`,
          borderRadius: `${TOKENS_LAYOUT.cartao.raio}px`,
          boxShadow: "none",
          backgroundImage: "none",
          border: `1px solid ${theme.vars.palette.divider}`,
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

export type CartaoCabecalhoProps = Omit<StackProps, "className">;

/** Linha do cabeçalho, com título à esquerda e ações à direita. */
export function CartaoCabecalho({ sx, ...props }: CartaoCabecalhoProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      {...props}
      sx={[
        {
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          minWidth: 0,
          mb: 2,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

export type CartaoTituloProps = Omit<
  TypographyProps,
  "variant" | "component" | "ref" | "className"
>;

/** Título semântico do cartão, no nível dois da página. */
export function CartaoTitulo({ sx, children, ...props }: CartaoTituloProps) {
  return (
    <Typography
      component="h2"
      variant="subtitle2"
      {...props}
      sx={[
        {
          minWidth: 0,
          fontWeight: 600,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

export type CartaoConteudoProps = Omit<CardContentProps, "className">;

/** Conteúdo do cartão em coluna, sem padding duplicado. */
export function CartaoConteudo({ sx, ...props }: CartaoConteudoProps) {
  return (
    <CardContent
      {...props}
      sx={[
        {
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          "&:last-child": { paddingBottom: 0 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

export type CartaoAcoesProps = Omit<CardActionsProps, "className">;

/** Ações do cartão, alinhadas à direita e sem espaçamento duplicado. */
export function CartaoAcoes({ sx, ...props }: CartaoAcoesProps) {
  return (
    <CardActions
      disableSpacing
      {...props}
      sx={[
        {
          padding: 0,
          gap: 1,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
