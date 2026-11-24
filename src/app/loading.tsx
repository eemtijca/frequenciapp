"use client";

// Esqueleto do shell enquanto a página resolve a sessão e os dados do mês.
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { TOKENS_LAYOUT } from "@/theme/layout";

export default function Carregando() {
  return (
    <Box
      aria-busy="true"
      sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, minHeight: "100dvh" }}
    >
      <Box
        sx={{
          display: { xs: "none", md: "block" },
          width: TOKENS_LAYOUT.gaveta,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
        }}
      />
      <Box sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column" }}>
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
              <Skeleton variant="text" width={144} height={24} />
              <Skeleton variant="text" width={96} height={16} />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Skeleton variant="circular" width={44} height={44} />
              <Skeleton variant="circular" width={44} height={44} />
            </Stack>
          </Stack>
        </Box>
        <Stack spacing={2} sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, pt: 2 }}>
          <Skeleton variant="text" width={176} height={28} />
          <Skeleton variant="rounded" height={44} />
          <Stack direction="row" spacing={1.5}>
            <Skeleton variant="rounded" height={64} sx={{ flex: 1 }} />
            <Skeleton variant="rounded" height={64} sx={{ flex: 1 }} />
          </Stack>
          <Skeleton variant="rounded" height={256} />
        </Stack>
      </Box>
    </Box>
  );
}
