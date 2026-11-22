// Distingue os interruptores do rascunho das operações de cada planilha.
import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ESPACO_COMPOSICAO, TOKENS_LAYOUT } from "@/theme/layout";

export default function PreferenciasPlanilha({ children }: { children: ReactNode }) {
  return (
    <Stack
      component="fieldset"
      spacing={ESPACO_COMPOSICAO.textoAcaoEmpilhada}
      useFlexGap
      sx={{
        m: 0,
        p: 2,
        minWidth: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: TOKENS_LAYOUT.campo.raio,
      }}
    >
      <Typography component="legend" variant="subtitle2" sx={{ px: 1 }}>
        Preferências no rascunho
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Os interruptores só são aplicados ao confirmar em Salvar configurações.
      </Typography>
      {children}
    </Stack>
  );
}
