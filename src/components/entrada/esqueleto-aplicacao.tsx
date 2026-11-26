"use client";

// Esqueleto do shell enquanto a página resolve a sessão e os dados do mês.
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";
import { TOKENS_LAYOUT } from "@/theme/layout";

export function EsqueletoAplicacao({ comNavegacao = false }: { comNavegacao?: boolean } = {}) {
  const { animacoesAtivas } = useAnimacoesDaInterface();
  const animacao = animacoesAtivas ? "pulse" : false;
  return (
    <Box
      aria-busy="true"
      sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, minHeight: "100dvh" }}
    >
      <Box
        aria-hidden="true"
        aria-label={comNavegacao ? "Navegação em carregamento" : undefined}
        sx={{
          display: { xs: comNavegacao ? "block" : "none", md: "block" },
          width: { xs: comNavegacao ? "100%" : TOKENS_LAYOUT.gaveta, md: TOKENS_LAYOUT.gaveta },
          flexShrink: 0,
          borderRight: { xs: 0, md: 1 },
          borderBottom: { xs: comNavegacao ? 1 : 0, md: 0 },
          borderColor: "divider",
        }}
      >
        {comNavegacao ? (
          <Stack spacing={2} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Skeleton animation={animacao} variant="rounded" width={40} height={40} />
              <Skeleton animation={animacao} variant="text" width={128} height={24} />
            </Stack>
            <Stack spacing={1} sx={{ display: { xs: "none", md: "flex" } }}>
              {[1, 2, 3, 4, 5].map((linha) => (
                <Skeleton key={linha} animation={animacao} variant="rounded" height={40} />
              ))}
            </Stack>
          </Stack>
        ) : null}
      </Box>
      <Box
        aria-hidden="true"
        aria-label={comNavegacao ? "Conteúdo em carregamento" : undefined}
        sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column" }}
      >
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              px: { xs: 2, sm: 3 },
              py: 1.5,
            }}
          >
            <Stack spacing={0.75}>
              <Skeleton animation={animacao} variant="text" width={144} height={24} />
              <Skeleton animation={animacao} variant="text" width={96} height={16} />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Skeleton animation={animacao} variant="circular" width={44} height={44} />
              <Skeleton animation={animacao} variant="circular" width={44} height={44} />
            </Stack>
          </Stack>
        </Box>
        <Stack spacing={2} sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, pt: 2 }}>
          <Skeleton animation={animacao} variant="text" width={176} height={28} />
          <Skeleton animation={animacao} variant="rounded" height={44} />
          <Stack direction="row" spacing={1.5}>
            <Skeleton animation={animacao} variant="rounded" height={64} sx={{ flex: 1 }} />
            <Skeleton animation={animacao} variant="rounded" height={64} sx={{ flex: 1 }} />
          </Stack>
          <Skeleton animation={animacao} variant="rounded" height={256} />
        </Stack>
      </Box>
    </Box>
  );
}
