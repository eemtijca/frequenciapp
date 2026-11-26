"use client";

// Avisos globais em Snackbar e Alert, com fila curta, repetição e leitura acessível.
import {
  createContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Alert, { alertClasses } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
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
  publico?: boolean;
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

// Sem sessão ativa, inclusive em montagens isoladas, só avisos públicos entram na fila.
let escopoAtivo: symbol | null = null;
let pausado = false;
export const ContextoEscopoAvisos = createContext<symbol | null>(null);

export function pausarAvisosDaSessao() {
  pausado = true;
  const publicos = avisos.filter((aviso) => aviso.publico);
  if (publicos.length === avisos.length) return;
  avisos = publicos;
  emitir();
}

export function retomarAvisosDaSessao() {
  pausado = false;
}

export function encerrarAvisosDaSessao() {
  escopoAtivo = null;
  pausarAvisosDaSessao();
}

export function EscopoAvisosDaSessao({
  autenticado,
  children,
}: {
  autenticado: boolean;
  children: ReactNode;
}) {
  const [identidade] = useState(() => Symbol("sessão"));
  const escopo = autenticado ? identidade : null;
  useLayoutEffect(() => {
    escopoAtivo = escopo;
    pausado = false;
    return () => {
      if (escopoAtivo === escopo) encerrarAvisosDaSessao();
    };
  }, [escopo]);
  return <ContextoEscopoAvisos.Provider value={escopo}>{children}</ContextoEscopoAvisos.Provider>;
}

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

/** Publica um aviso privado apenas no escopo capturado pelo produtor. */
export function publicarAviso(entrada: EntradaAviso, escopo: symbol | null): string {
  return enfileirar(entrada, false, escopo);
}

export function publicarAvisoPublico(entrada: EntradaAviso): string {
  return enfileirar(entrada, true);
}

function enfileirar(entrada: EntradaAviso, publico: boolean, escopo: symbol | null = null): string {
  const chave = ++sequencia;
  const id = entrada.id ?? `aviso-${chave}`;
  if (!publico && (pausado || escopo === null || escopo !== escopoAtivo)) return id;
  const duracao = entrada.duracao ?? DURACOES_AVISO[entrada.severidade];
  const aviso: Aviso = {
    id,
    chave,
    publico,
    severidade: entrada.severidade,
    titulo: entrada.titulo,
    descricao: entrada.descricao,
    duracao,
    expiraEm: Date.now() + duracao,
    tentarDeNovo:
      entrada.tentarDeNovo &&
      (() => {
        if (avisos.some((atual) => atual.chave === chave)) entrada.tentarDeNovo?.();
      }),
  };
  const semRepetido = avisos.filter((atual) => atual.id !== id || atual.publico !== publico);
  avisos = [...semRepetido, aviso].slice(-LIMITE_AVISOS);
  emitir();
  return id;
}

/** Remove um aviso pelo identificador, sem efeito quando ele já saiu da fila. */
export function removerAviso(id: string, chave?: number): void {
  const restantes = avisos.filter(
    (atual) => atual.id !== id || (chave !== undefined && atual.chave !== chave),
  );
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

/** Alinha ícone e fechamento à mensagem, com a ação em uma linha independente. */
export function AvisoFlutuante({
  severidade,
  children,
  aoFechar,
  acao,
  sombra = false,
}: {
  severidade: SeveridadeAviso;
  children: ReactNode;
  aoFechar: () => void;
  acao?: { rotulo: string; executar: () => void };
  sombra?: boolean;
}) {
  return (
    <Alert
      severity={severidade}
      role={PAPEIS[severidade]}
      aria-live={LEITURAS[severidade]}
      aria-atomic="true"
      variant="standard"
      sx={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        rowGap: 0.5,
        boxShadow: sombra ? "var(--template-palette-baseShadow)" : undefined,
        [`& .${alertClasses.icon}`]: { gridArea: "1 / 1", p: 0 },
        [`& .${alertClasses.message}`]: { display: "contents" },
        [`& .${alertClasses.action}`]: { gridArea: "1 / 3", m: 0, py: 0, pl: 1 },
      }}
      action={
        <IconButton
          color="inherit"
          aria-label="Fechar aviso"
          onClick={aoFechar}
          sx={{ width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      }
    >
      <Box sx={{ gridArea: "1 / 2", overflowWrap: "anywhere" }}>{children}</Box>
      {acao && (
        <Button
          color="inherit"
          size="small"
          onClick={acao.executar}
          sx={{
            gridArea: "2 / 2 / 3 / 4",
            justifySelf: "start",
            minWidth: TOKENS_LAYOUT.alvoToque,
            minHeight: TOKENS_LAYOUT.alvoToque,
          }}
        >
          {acao.rotulo}
        </Button>
      )}
    </Alert>
  );
}

/** Um alerta da fila, com título, descrição, fechamento e ação de repetir. */
export function AvisoAlerta({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  const tentarDeNovo = aviso.tentarDeNovo;
  const acao = tentarDeNovo && {
    rotulo: "Tentar novamente",
    executar: () => {
      tentarDeNovo();
      aoFechar();
    },
  };
  return (
    <AvisoFlutuante severidade={aviso.severidade} aoFechar={aoFechar} acao={acao} sombra>
      <AlertTitle sx={{ mt: 0, mb: aviso.descricao ? 0.25 : 0 }}>{aviso.titulo}</AlertTitle>
      {aviso.descricao && (
        <Typography component="p" variant="body2">
          {aviso.descricao}
        </Typography>
      )}
    </AvisoFlutuante>
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
        if (aviso.expiraEm <= agora) removerAviso(aviso.id, aviso.chave);
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
        if (primeiro) removerAviso(primeiro.id, primeiro.chave);
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
          <AvisoAlerta
            key={aviso.chave}
            aviso={aviso}
            aoFechar={() => removerAviso(aviso.id, aviso.chave)}
          />
        ))}
      </Stack>
    </Snackbar>
  );
}
