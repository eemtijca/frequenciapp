"use client";

// Componentes visuais compartilhados pelos resumos semanais das quatro telas.
import { createElement, type ElementType, type ReactNode } from "react";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import { ESPACO_COMPOSICAO } from "@/theme/layout";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";
import { rotuloData, rotuloDataCurta } from "@/domain/frequencia";
import { Acordeao, type NivelTituloAcordeao } from "@/components/ui/mui/acordeao";
import { AtualizadoEm } from "@/components/ui/mui/atualizado-em";
import { Selo, type TomSelo } from "@/components/ui/mui/selo";

type IconeResumo = ElementType;

export function CabecalhoResumo({
  dias,
  domingo,
  atualizadoEm,
  fuso,
  titulo = "Resumo da semana",
  descricao,
}: {
  dias: readonly string[];
  domingo?: string | null;
  atualizadoEm?: string | null;
  fuso: string;
  titulo?: string;
  descricao?: string;
}) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 2,
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, flex: 1, alignItems: "flex-start" }}>
        <Box
          aria-hidden="true"
          sx={(theme) => ({
            display: "flex",
            width: 36,
            height: 36,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 2,
            backgroundColor: theme.vars.palette.action.hover,
            color: theme.vars.palette.text.secondary,
          })}
        >
          <CalendarMonthRoundedIcon fontSize="small" />
        </Box>
        <Stack spacing={ESPACO_COMPOSICAO.tituloDescricao} useFlexGap sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
            {titulo}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {de && ate ? `${rotuloDataCurta(de)} a ${rotuloDataCurta(ate)}` : ""}
            {domingo ? `, encerrada em ${rotuloData(domingo)}` : ""}
          </Typography>
          {descricao ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {descricao}
            </Typography>
          ) : null}
        </Stack>
      </Stack>
      <Stack
        spacing={0.5}
        sx={{
          flexShrink: 0,
          alignItems: { xs: "flex-start", sm: "flex-end" },
          width: { xs: "100%", sm: "auto" },
        }}
      >
        <Selo rotulo="Somente leitura" tom="neutro" tamanho="pequeno" />
        <AtualizadoEm instante={atualizadoEm ?? undefined} fuso={fuso} />
      </Stack>
    </Box>
  );
}

export function CorpoResumo({ children }: { children: ReactNode }) {
  return (
    <Stack
      spacing={2.5}
      sx={{
        borderTop: 1,
        borderColor: "divider",
        px: { xs: 1.5, sm: 2 },
        pt: 2,
        pb: 2,
      }}
    >
      {children}
    </Stack>
  );
}

export function SecaoResumo({
  id,
  titulo,
  descricao,
  icone,
  resumo,
  aberto,
  onAbertoChange,
  nivel = "interna",
  children,
}: {
  id: string;
  titulo: string;
  descricao?: string;
  icone: IconeResumo;
  resumo?: ReactNode;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  nivel?: "raiz" | "interna";
  children: ReactNode;
}) {
  const nivelTitulo: NivelTituloAcordeao = nivel === "raiz" ? "h3" : "h4";

  return (
    <Box data-secao={`resumo-${id}`} data-state={aberto ? "open" : "closed"}>
      <Acordeao
        titulo={titulo}
        aberto={aberto}
        onChange={onAbertoChange}
        nivelTitulo={nivelTitulo}
        resumo={
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", minWidth: 0 }}>
            <Box
              aria-hidden="true"
              sx={(theme) => ({
                display: "flex",
                width: 28,
                height: 28,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 1.5,
                backgroundColor:
                  nivel === "raiz"
                    ? theme.vars.palette.primary.main
                    : theme.vars.palette.action.hover,
                color:
                  nivel === "raiz"
                    ? theme.vars.palette.primary.contrastText
                    : theme.vars.palette.text.secondary,
                "& svg": { width: 16, height: 16 },
              })}
            >
              {createElement(icone, { size: 16, "aria-hidden": true })}
            </Box>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              {descricao ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {descricao}
                </Typography>
              ) : null}
              {resumo ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {resumo}
                </Stack>
              ) : null}
            </Stack>
          </Stack>
        }
      >
        <Stack spacing={2}>{children}</Stack>
      </Acordeao>
    </Box>
  );
}

export type TomCartaoDia = "salva" | "pendente" | "falta" | "ajuste" | "registrado" | "neutro";

const TONS_SELO = {
  salva: "sucesso",
  pendente: "atencao",
  falta: "perigo",
  ajuste: "neutro",
  registrado: "sucesso",
  neutro: "neutro",
} as const satisfies Record<TomCartaoDia, TomSelo>;

function estiloCartao(theme: Theme, destaque: boolean) {
  return {
    display: "flex",
    width: "100%",
    minHeight: 128,
    flexDirection: "column" as const,
    alignItems: "stretch",
    gap: 1,
    p: 1.5,
    textAlign: "left" as const,
    borderRadius: "inherit",
    color: "inherit",
    backgroundColor: destaque ? theme.vars.palette.action.hover : "transparent",
    "&:hover": destaque ? { backgroundColor: theme.vars.palette.action.selected } : {},
  };
}

export function CartaoDia({
  dia,
  rotulo,
  status,
  tom,
  contagens,
  detalhe,
  abrir,
  onAbrir,
  ariaLabel,
}: {
  dia: string;
  rotulo: string;
  status: string;
  tom: TomCartaoDia;
  contagens?: ReactNode;
  detalhe?: string;
  abrir: boolean;
  onAbrir?: () => void;
  ariaLabel: string;
}) {
  const conteudo = (
    <>
      <Box
        sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            variant="caption"
            noWrap
            sx={{ fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}
          >
            {rotulo}
          </Typography>
          <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
            {rotuloDataCurta(dia)}
          </Typography>
        </Box>
        {abrir ? (
          <ChevronRightRoundedIcon
            aria-hidden="true"
            fontSize="small"
            sx={{ color: "text.secondary", flexShrink: 0 }}
          />
        ) : null}
      </Box>
      <Selo
        component="span"
        rotulo={status}
        tom={TONS_SELO[tom]}
        tamanho="pequeno"
        sx={(theme) => ({
          alignSelf: "flex-start",
          ...(tom === "ajuste"
            ? {
                backgroundColor: theme.vars.palette.justificada.fraco,
                color: theme.vars.palette.justificada.texto,
              }
            : {}),
        })}
      />
      <Box
        sx={{
          mt: "auto",
          display: "flex",
          minHeight: 32,
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.75,
        }}
      >
        {contagens ?? (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Sem registro
          </Typography>
        )}
      </Box>
      {detalhe ? (
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
          {detalhe}
        </Typography>
      ) : null}
    </>
  );

  return (
    <Card
      component="li"
      variant="outlined"
      elevation={0}
      sx={{ p: 0, minWidth: 0, backgroundColor: "background.paper" }}
    >
      {abrir ? (
        <ButtonBase
          type="button"
          onClick={onAbrir}
          aria-label={ariaLabel}
          data-dia={dia}
          sx={(theme) => estiloCartao(theme, true)}
        >
          {conteudo}
        </ButtonBase>
      ) : (
        <Box
          role="group"
          aria-label={ariaLabel}
          data-dia={dia}
          sx={(theme) => ({
            ...estiloCartao(theme, false),
            color: theme.vars.palette.text.secondary,
          })}
        >
          {conteudo}
        </Box>
      )}
    </Card>
  );
}

export function BarrasDia({
  dias,
  unidade,
  titulo,
}: {
  dias: { dia: string; rotulo: string; valor: number }[];
  unidade: [singular: string, plural: string];
  titulo: string;
}) {
  const maior = Math.max(1, ...dias.map((item) => item.valor));
  const total = dias.reduce((soma, item) => soma + item.valor, 0);
  const resumo = dias
    .map((item) => `${item.rotulo}: ${item.valor} ${item.valor === 1 ? unidade[0] : unidade[1]}`)
    .join("; ");
  return (
    <Box component="figure" sx={{ display: "flex", flexDirection: "column", gap: 1, m: 0 }}>
      <Typography component="figcaption" variant="caption" sx={{ color: "text.secondary" }}>
        {titulo}: {total} {total === 1 ? unidade[0] : unidade[1]} na semana
      </Typography>
      <Box
        component="ul"
        role="img"
        aria-label={`${titulo}. ${resumo}.`}
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", sm: "repeat(6, minmax(0, 1fr))" },
          gap: 1,
          listStyle: "none",
          m: 0,
          p: 0,
        }}
      >
        {dias.map((item) => (
          <Box
            component="li"
            key={item.dia}
            sx={{
              display: "flex",
              minWidth: 0,
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <Box
              sx={(theme) => ({
                display: "flex",
                width: "100%",
                height: 96,
                alignItems: "flex-end",
                overflow: "hidden",
                borderRadius: 1.5,
                backgroundColor: theme.vars.palette.action.hover,
              })}
            >
              <Box
                aria-hidden="true"
                sx={(theme) => ({
                  width: "100%",
                  height: `${Math.max(4, (item.valor / maior) * 100)}%`,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  backgroundColor: theme.vars.palette.primary.main,
                })}
              />
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
              {item.rotulo}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
            >
              {item.valor}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function ResumoVazio({ texto }: { texto: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
      <CalendarMonthRoundedIcon fontSize="small" aria-hidden="true" />
      <Typography variant="body2">{texto}</Typography>
    </Stack>
  );
}
