"use client";

// A espera da troca ocupa só o conteúdo, sem deslocar a navegação.
import {
  useEffect,
  useImperativeHandle,
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

export function QuadroDasVisoes({
  iniciarTrocaRef,
  pagerRef,
  children,
}: {
  iniciarTrocaRef: Ref<(acao: () => void) => void>;
  pagerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  // A atualização urgente de pendência não passa pelo shell nem pelas visões.
  const [pendente, iniciarTroca] = useTransition();
  useImperativeHandle(iniciarTrocaRef, () => iniciarTroca, [iniciarTroca]);
  const mostrar = useEsperaProlongada(pendente);

  return (
    <Box sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Box
        ref={pagerRef}
        data-pager="principal"
        aria-busy={mostrar || undefined}
        inert={mostrar}
        sx={{ height: "100%", overflow: "hidden" }}
      >
        {children}
      </Box>
      {mostrar ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
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

function useEsperaProlongada(pendente: boolean) {
  const [ciclo, setCiclo] = useState({ pendente, mostrar: false });
  if (ciclo.pendente !== pendente) setCiclo({ pendente, mostrar: false });
  useEffect(() => {
    if (!pendente) return;
    const timer = window.setTimeout(() => setCiclo({ pendente: true, mostrar: true }), 200);
    return () => window.clearTimeout(timer);
  }, [pendente]);
  return pendente && ciclo.mostrar;
}

// Para leituras indispensáveis iniciadas depois que a visão já montou.
export function EsperaDaVisao({ rotulo }: { rotulo: string }) {
  return useEsperaProlongada(true) ? <EsqueletoDaVisao rotulo={rotulo} /> : null;
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
