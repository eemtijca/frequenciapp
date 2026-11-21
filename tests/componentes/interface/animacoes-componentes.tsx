// Monta diálogo e acordeão reais para verificar as transições MUI e o movimento reduzido.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import { ThemeProvider } from "@mui/material/styles";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { tema } from "@/theme/tema";

// Mesmo bloco global do provedor de tema, necessário para o teste de movimento reduzido.
const estilosGlobais = {
  "@media (prefers-reduced-motion: reduce)": {
    "*, *::before, *::after": {
      animationDuration: "0.01ms !important",
      animationDelay: "0ms !important",
      animationIterationCount: 1,
      transitionDuration: "0.01ms !important",
      transitionDelay: "0ms !important",
      scrollBehavior: "auto !important",
    },
  },
};

function Aplicacao() {
  const [modal, setModal] = useState(false);
  const [aberto, setAberto] = useState(false);
  return (
    <Box sx={{ p: 2 }}>
      <Botao type="button" onClick={() => setModal(true)}>
        Abrir modal
      </Botao>
      <Dialogo aberto={modal} onFechar={() => setModal(false)} titulo="Modal de teste">
        <p>Conteúdo modal</p>
      </Dialogo>
      <Acordeao titulo="Configurações" aberto={aberto} onChange={setAberto}>
        <button type="button">Ação interna</button>
      </Acordeao>
      <button type="button">Ação externa</button>
    </Box>
  );
}

const raiz = document.getElementById("root");
if (raiz)
  createRoot(raiz).render(
    <ThemeProvider theme={tema}>
      <CssBaseline enableColorScheme />
      <GlobalStyles styles={estilosGlobais} />
      <Aplicacao />
    </ThemeProvider>,
  );
