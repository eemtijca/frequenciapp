"use client";

// Avisos globais em Snackbar e Alert, com fila curta, repetição e leitura acessível.
import { useEffect, useSyncExternalStore } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Alert, { alertClasses } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TOKENS_LAYOUT } from "@/theme/layout";

export type SeveridadeAviso = "success" | "info" | "error";

export interface Aviso {
  id: string;
  chave: number;
  severidade: SeveridadeAviso;
  titulo: string;
  descricao?: string;
  duracao: number;
  expiraEm: number;
  tentarDeNovo?: () => void;
}

export interface EntradaAviso {
  id?: string;
  severidade: SeveridadeAviso;
  titulo: string;
  descricao?: string;
  duracao?: number;
  tentarDeNovo?: () => void;
}

export const DURACOES_AVISO = {
  success: 8000,
  info: 6000,
  error: 8000,
} as const satisfies Record<SeveridadeAviso, number>;

export const LIMITE_AVISOS = 3;

const DESLOCAMENTO_CELULAR = 84;
const DESLOCAMENTO_DESKTOP = 96;

/** Equilibra os três espaços do Alert sem alterar alertas incorporados às telas. */
export const ESTILOS_AVISO_FLUTUANTE = {
  width: "100%",
  alignItems: "center",
  [`& .${alertClasses.icon}`]: { p: 0 },
  [`& .${alertClasses.message}`]: { flex: 1, minWidth: 0, py: 0, overflowWrap: "anywhere" },
  [`& .${alertClasses.action}`]: { alignItems: "center", mt: 0, mr: 0, py: 0, pl: 1 },
} as const;

export function FecharAviso({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      color="inherit"
      aria-label="Fechar aviso"
      onClick={onClick}
      sx={{ width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque }}
    >
      <CloseRoundedIcon fontSize="small" />
    </IconButton>
  );
}

const PAPEIS = {
  success: "status",
  info: "status",
  error: "alert",
} as const satisfies Record<SeveridadeAviso, "status" | "alert">;

const LEITURAS = {
  success: "polite",
  info: "polite",
  error: "assertive",
} as const satisfies Record<SeveridadeAviso, "polite" | "assertive">;

const AVISOS_VAZIOS: readonly Aviso[] = [];

let avisos: readonly Aviso[] = AVISOS_VAZIOS;
let sequencia = 0;
const ouvintes = new Set<() => void>();

function emitir(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function assinarAvisos(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Instantâneo atual da fila, estável entre publicações. */
export function obterAvisos(): readonly Aviso[] {
  return avisos;
}

function obterAvisosNoServidor(): readonly Aviso[] {
  return AVISOS_VAZIOS;
}

/** Publica um aviso e devolve o identificador usado na fila. */
export function publicarAviso(entrada: EntradaAviso): string {
  sequencia += 1;
  const id = entrada.id ?? `aviso-${sequencia}`;
  const duracao = entrada.duracao ?? DURACOES_AVISO[entrada.severidade];
  const aviso: Aviso = {
    id,
    chave: sequencia,
    severidade: entrada.severidade,
    titulo: entrada.titulo,
    descricao: entrada.descricao,
    duracao,
    expiraEm: Date.now() + duracao,
    tentarDeNovo: entrada.tentarDeNovo,
  };
  const semRepetido = avisos.filter((atual) => atual.id !== id);
  avisos = [...semRepetido, aviso].slice(-LIMITE_AVISOS);
  emitir();
  return id;
}

/** Remove um aviso pelo identificador, sem efeito quando ele já saiu da fila. */
export function removerAviso(id: string): void {
  const restantes = avisos.filter((atual) => atual.id !== id);
  if (restantes.length === avisos.length) return;
  avisos = restantes;
  emitir();
}

/** Esvazia a fila em limpezas explícitas e nos testes. */
export function limparAvisos(): void {
  if (avisos.length === 0) return;
  avisos = AVISOS_VAZIOS;
  emitir();
}

/** Um alerta da fila, com título, descrição, fechamento e ação de repetir. */
export function AvisoAlerta({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const repetir = () => {
    aviso.tentarDeNovo?.();
    aoFechar();
  };

  return (
    <Alert
      severity={aviso.severidade}
      role={PAPEIS[aviso.severidade]}
      aria-live={LEITURAS[aviso.severidade]}
      aria-atomic="true"
      variant="standard"
      sx={{ ...ESTILOS_AVISO_FLUTUANTE, boxShadow: "var(--template-palette-baseShadow)" }}
      action={<FecharAviso onClick={aoFechar} />}
    >
      <AlertTitle sx={{ mt: 0, mb: aviso.descricao ? 0.25 : 0 }}>{aviso.titulo}</AlertTitle>
      {aviso.descricao ? (
        <Typography component="p" variant="body2">
          {aviso.descricao}
        </Typography>
      ) : null}
      {aviso.tentarDeNovo ? (
        <Button
          color="inherit"
          size="small"
          onClick={repetir}
          sx={{ mt: 0.5, minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          Tentar novamente
        </Button>
      ) : null}
    </Alert>
  );
}

/** Provedor dos avisos: assina a fila, agenda a expiração e posiciona o Snackbar. */
export function ProvedorAvisos() {
  const avisosAtuais = useSyncExternalStore(assinarAvisos, obterAvisos, obterAvisosNoServidor);

  useEffect(() => {
    if (avisosAtuais.length === 0) return;
    const proximo = avisosAtuais.reduce(
      (menor, aviso) => Math.min(menor, aviso.expiraEm),
      Number.POSITIVE_INFINITY,
    );
    const espera = Math.max(0, proximo - Date.now());
    const temporizador = window.setTimeout(() => {
      const agora = Date.now();
      for (const aviso of avisosAtuais) {
        if (aviso.expiraEm <= agora) removerAviso(aviso.id);
      }
    }, espera);
    return () => window.clearTimeout(temporizador);
  }, [avisosAtuais]);

  return (
    <Snackbar
      open={avisosAtuais.length > 0}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      onClose={(_evento, motivo) => {
        if (motivo === "clickaway") return;
        const primeiro = avisosAtuais[0];
        if (primeiro) removerAviso(primeiro.id);
      }}
      sx={{
        bottom: {
          xs: `max(calc(${DESLOCAMENTO_CELULAR}px + env(safe-area-inset-bottom, 0px)), calc(var(--altura-rodape-configuracoes, 0px) + max(8px, env(safe-area-inset-bottom, 0px)) + 8px))`,
          sm: `max(${DESLOCAMENTO_DESKTOP}px, calc(var(--altura-rodape-configuracoes, 0px) + max(8px, env(safe-area-inset-bottom, 0px)) + 8px))`,
        },
      }}
    >
      <Stack spacing={1} sx={{ width: "100%", maxWidth: 480 }}>
        {avisosAtuais.map((aviso) => (
          <AvisoAlerta key={aviso.chave} aviso={aviso} aoFechar={() => removerAviso(aviso.id)} />
        ))}
      </Stack>
    </Snackbar>
  );
}
