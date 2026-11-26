"use client";

// A espera da troca ocupa só o conteúdo, sem deslocar a navegação.
import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";

type RegistrarLeitura = () => () => void;
const ContextoLeitura = createContext<RegistrarLeitura | null>(null);

export function LimiteLeituraDaVisao({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  const registrar = useContext(ContextoLeitura);
  return <ContextoLeitura value={ativo ? registrar : null}>{children}</ContextoLeitura>;
}

// Sinaliza uma leitura que impede o primeiro uso do destino, não uma carga secundária.
export function useLeituraDaVisao(pendente: boolean) {
  const registrar = useContext(ContextoLeitura);
  useLayoutEffect(() => {
    if (pendente) return registrar?.();
  }, [pendente, registrar]);
}

export function QuadroDasVisoes({
  iniciarTrocaRef,
  pagerRef,
  destino,
  onPronto,
  children,
}: {
  iniciarTrocaRef: Ref<(acao: () => void) => void>;
  pagerRef: RefObject<HTMLDivElement | null>;
  destino: string;
  onPronto: () => void;
  children: ReactNode;
}) {
  // A atualização urgente de pendência não passa pelo shell nem pelas visões.
  const [pendente, iniciarTroca] = useTransition();
  useImperativeHandle(iniciarTrocaRef, () => iniciarTroca, [iniciarTroca]);
  const [ciclo, setCiclo] = useState({ destino, pronto: true });
  if (ciclo.destino !== destino) setCiclo({ destino, pronto: false });
  const leituras = useRef(0);
  const concluirRef = useRef<(() => void) | null>(null);
  const registrar = useCallback(() => {
    leituras.current++;
    return () => {
      if (--leituras.current === 0) {
        // No mesmo commit, o próximo painel ainda pode registrar sua leitura.
        queueMicrotask(() => concluirRef.current?.());
      }
    };
  }, []);
  const concluir = useCallback(() => {
    if (!pendente && leituras.current === 0) {
      setCiclo((atual) =>
        atual.destino === destino && !atual.pronto ? { destino, pronto: true } : atual,
      );
    }
  }, [destino, pendente]);

  useLayoutEffect(() => {
    concluirRef.current = concluir;
    concluir();
    return () => {
      concluirRef.current = null;
    };
  }, [concluir]);

  // A troca e a leitura usam o mesmo indicador, sem uma pintura entre as fases.
  const mostrar = pendente || !ciclo.pronto;
  useLayoutEffect(() => {
    if (!mostrar) onPronto();
  }, [mostrar, onPronto]);

  return (
    <Box sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Box
        ref={pagerRef}
        data-pager="principal"
        aria-busy={mostrar || undefined}
        inert={mostrar}
        aria-hidden={mostrar || undefined}
        sx={{ position: "relative", zIndex: 0, height: "100%", overflow: "hidden" }}
      >
        <ContextoLeitura value={registrar}>{children}</ContextoLeitura>
      </Box>
      {mostrar ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            bgcolor: "background.default",
            px: { xs: 2, md: 4 },
            pt: 2,
          }}
        >
          <EsqueletoDaVisao rotulo="Carregando a tela..." />
        </Box>
      ) : null}
    </Box>
  );
}

// Para leituras indispensáveis iniciadas depois que a visão já montou.
export function EsperaDaVisao({ rotulo }: { rotulo: string }) {
  useLeituraDaVisao(true);
  return <EsqueletoDaVisao rotulo={rotulo} />;
}

function EsqueletoDaVisao({ rotulo }: { rotulo: string }) {
  const { animacoesAtivas } = useAnimacoesDaInterface();
  const animacao = animacoesAtivas ? "pulse" : false;

  return (
    <Stack role="status" spacing={2}>
      <Typography component="p" variant="body2" color="text.secondary">
        {rotulo}
      </Typography>
      <Stack aria-hidden="true" spacing={2}>
        <Skeleton animation={animacao} variant="text" width="40%" height={32} />
        <Skeleton animation={animacao} variant="rounded" height={48} />
        <Skeleton animation={animacao} variant="rounded" height={144} />
      </Stack>
    </Stack>
  );
}
