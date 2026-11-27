// Área de toque mínima para controles compactos, sem aumentar o desenho visível.
import { TOKENS_LAYOUT } from "@/theme/layout";

export const ESTILO_ALVO_TOQUE = {
  position: "relative",
  "&::after": {
    content: '""',
    position: "absolute",
    top: "50%",
    left: "50%",
    width: `max(100%, ${TOKENS_LAYOUT.alvoToque}px)`,
    height: `max(100%, ${TOKENS_LAYOUT.alvoToque}px)`,
    transform: "translate(-50%, -50%)",
  },
} as const;
