"use client";

// Telas e avisos de estado: mensagens padronizadas, ícone, código, referência e ações.
import { useEffect, useRef, type ReactNode } from "react";
import CloudOffRoundedIcon from "@mui/icons-material/CloudOffRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PersonOffRoundedIcon from "@mui/icons-material/PersonOffRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import WifiOffRoundedIcon from "@mui/icons-material/WifiOffRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { Botao, BotaoIcone } from "./botao";

export type VarianteEstado =
  | "nao_encontrado"
  | "erro_interno"
  | "indisponivel"
  | "dados_invalidos"
  | "sessao_expirada"
  | "sem_permissao"
  | "conta_desativada"
  | "limite"
  | "conflito"
  | "offline";

type Tom = "neutro" | "aviso" | "perigo";

interface Preset {
  icone: typeof CloudOffRoundedIcon;
  titulo: string;
  descricao: string;
  tom: Tom;
}

const PRESETS: Record<VarianteEstado, Preset> = {
  nao_encontrado: {
    icone: SearchOffRoundedIcon,
    titulo: "Página não encontrada",
    descricao: "O endereço pode estar errado ou a página foi movida.",
    tom: "neutro",
  },
  erro_interno: {
    icone: ErrorOutlineRoundedIcon,
    titulo: "Algo saiu do esperado",
    descricao: "Não foi possível carregar a tela. Tente novamente em instantes.",
    tom: "perigo",
  },
  indisponivel: {
    icone: CloudOffRoundedIcon,
    titulo: "Serviço indisponível",
    descricao: "Não foi possível falar com os dados da escola. Tente de novo em instantes.",
    tom: "aviso",
  },
  dados_invalidos: {
    icone: ReportProblemRoundedIcon,
    titulo: "Confira os dados",
    descricao: "Ajuste o que foi indicado e tente de novo.",
    tom: "perigo",
  },
  sessao_expirada: {
    icone: KeyRoundedIcon,
    titulo: "Sessão expirada",
    descricao: "Por segurança, entre novamente para continuar.",
    tom: "aviso",
  },
  sem_permissao: {
    icone: LockRoundedIcon,
    titulo: "Acesso restrito",
    descricao: "Sua conta não tem permissão para esta área.",
    tom: "perigo",
  },
  conta_desativada: {
    icone: PersonOffRoundedIcon,
    titulo: "Conta desativada",
    descricao: "A administração desativou esta conta. Procure a direção da escola.",
    tom: "perigo",
  },
  limite: {
    icone: HourglassEmptyRoundedIcon,
    titulo: "Muitas tentativas",
    descricao: "Aguarde alguns minutos antes de tentar de novo.",
    tom: "aviso",
  },
  conflito: {
    icone: SyncProblemRoundedIcon,
    titulo: "Não foi possível concluir",
    descricao: "Revise os dados e tente novamente.",
    tom: "aviso",
  },
  offline: {
    icone: WifiOffRoundedIcon,
    titulo: "Sem conexão",
    descricao: "Verifique a internet. As marcações na tela não se perdem.",
    tom: "aviso",
  },
};

const SEVERIDADES = {
  neutro: "info",
  aviso: "warning",
  perigo: "error",
} as const satisfies Record<Tom, "info" | "warning" | "error">;

const PAPEIS = {
  neutro: "status",
  aviso: "status",
  perigo: "alert",
} as const satisfies Record<Tom, "status" | "alert">;

export interface AcaoEstado {
  rotulo: string;
  onClick?: () => void;
  href?: string;
}

function BotaoAcao({ acao, secundaria }: { acao: AcaoEstado; secundaria?: boolean }) {
  const variante = secundaria ? "contorno" : "primario";
  if (acao.href) {
    return (
      <Botao variante={variante} href={acao.href}>
        {acao.rotulo}
      </Botao>
    );
  }
  return (
    <Botao variante={variante} onClick={acao.onClick}>
      {acao.rotulo}
    </Botao>
  );
}

export interface TelaEstadoProps {
  variante: VarianteEstado;
  titulo?: string;
  descricao?: ReactNode;
  /** Código HTTP discreto, por exemplo 404 ou 500. */
  codigo?: number;
  /** Referência técnica para o suporte localizar o erro no log. */
  referencia?: string;
  acao?: AcaoEstado;
  acaoSecundaria?: AcaoEstado;
  /** Sem tela cheia, para uso dentro do shell. */
  incorporado?: boolean;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}

/** Estado de página inteira ou incorporado ao shell, com foco no título. */
export function TelaEstado({
  variante,
  titulo,
  descricao,
  codigo,
  referencia,
  acao,
  acaoSecundaria,
  incorporado = false,
  children,
  sx,
}: TelaEstadoProps) {
  const preset = PRESETS[variante];
  const Icone = preset.icone;
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!incorporado) tituloRef.current?.focus();
  }, [incorporado]);

  return (
    <Box
      component={incorporado ? "div" : "main"}
      sx={[
        {
          width: "100%",
          display: "flex",
          justifyContent: "center",
        },
        !incorporado && {
          alignItems: "center",
          minHeight: "100dvh",
          paddingX: 2,
          paddingY: 5,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Alert
        severity={SEVERIDADES[preset.tom]}
        role={PAPEIS[preset.tom]}
        icon={<Icone sx={{ fontSize: 32 }} />}
        sx={{
          width: "100%",
          maxWidth: TOKENS_LAYOUT.dialogo.larguraMaxima,
          padding: incorporado ? 2 : 3,
          alignItems: "flex-start",
          "& .MuiAlert-message": { width: "100%" },
          ...(incorporado
            ? {}
            : {
                flexDirection: "column",
                alignItems: "center",
                "& .MuiAlert-icon": { marginRight: 0, marginBottom: 1 },
              }),
        }}
      >
        <Stack
          spacing={2}
          sx={{
            width: "100%",
            alignItems: incorporado ? "stretch" : "center",
            textAlign: incorporado ? "left" : "center",
          }}
        >
          {codigo !== undefined ? (
            <Typography variant="overline" component="p" sx={{ color: "text.secondary" }}>
              Erro {codigo}
            </Typography>
          ) : null}
          <Typography
            ref={tituloRef}
            component={incorporado ? "h2" : "h1"}
            variant="h5"
            tabIndex={-1}
            sx={{ fontWeight: 600, outline: "none" }}
          >
            {titulo ?? preset.titulo}
          </Typography>
          <Typography variant="body2" component="div" sx={{ color: "text.secondary" }}>
            {descricao ?? preset.descricao}
          </Typography>
          {referencia ? (
            <Typography
              variant="caption"
              component="p"
              sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
            >
              Referência para suporte: {referencia}
            </Typography>
          ) : null}
          {children ? <Box sx={{ width: "100%" }}>{children}</Box> : null}
          {acao || acaoSecundaria ? (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{
                paddingTop: 1,
                flexWrap: "wrap",
                justifyContent: incorporado ? "flex-start" : "center",
              }}
            >
              {acao ? <BotaoAcao acao={acao} /> : null}
              {acaoSecundaria ? <BotaoAcao acao={acaoSecundaria} secundaria /> : null}
            </Stack>
          ) : null}
        </Stack>
      </Alert>
    </Box>
  );
}

export interface AlertaCompactoProps {
  variante: VarianteEstado;
  titulo?: string;
  descricao?: ReactNode;
  acao?: AcaoEstado;
  /** Bloco com ícone e ações, ou linha para diálogos e formulários. */
  tamanho?: "bloco" | "linha";
  onFechar?: () => void;
  sx?: SxProps<Theme>;
}

/** Aviso compacto para diálogos, formulários e trechos de tela. */
export function AlertaCompacto({
  variante,
  titulo,
  descricao,
  acao,
  tamanho = "bloco",
  onFechar,
  sx,
}: AlertaCompactoProps) {
  const preset = PRESETS[variante];
  const Icone = preset.icone;
  const linha = tamanho === "linha";
  const texto = descricao ?? preset.descricao;

  return (
    <Alert
      severity={SEVERIDADES[preset.tom]}
      role={PAPEIS[preset.tom]}
      icon={<Icone fontSize="small" />}
      action={
        onFechar ? (
          <BotaoIcone
            rotulo="Fechar"
            variante="texto"
            tamanho="pequeno"
            icone={<CloseRoundedIcon fontSize="small" />}
            onClick={onFechar}
          />
        ) : undefined
      }
      sx={[
        linha
          ? {
              paddingY: 0.5,
              paddingX: 1,
              alignItems: "center",
            }
          : {
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              "& .MuiAlert-icon": { marginRight: 0, marginBottom: 1 },
            },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Stack spacing={0.5} sx={{ alignItems: linha ? "flex-start" : "center" }}>
        <Typography component="p" variant="body2" sx={{ fontWeight: 600 }}>
          {titulo ?? preset.titulo}
        </Typography>
        {texto ? (
          <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
            {texto}
          </Typography>
        ) : null}
        {acao ? (
          <Box sx={{ paddingTop: 1 }}>
            <BotaoAcao acao={acao} secundaria />
          </Box>
        ) : null}
      </Stack>
    </Alert>
  );
}
