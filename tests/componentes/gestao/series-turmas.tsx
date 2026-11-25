// Monta os cadastros reais com o tema do aplicativo, sem aplicativo ou banco.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import AbaSeries from "@/components/gestao/abas/aba-series";
import AbaTurmas from "@/components/gestao/abas/aba-turmas";
import { tema } from "@/theme/tema";
import { series, turmas } from "./series-turmas-dados";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente.");
const parametros = new URLSearchParams(location.search);
const atualizar = async () => {};
const dados = parametros.has("sem-series") ? [] : series;
createRoot(raiz).render(
  <ThemeProvider
    theme={tema}
    defaultMode={parametros.get("tema") === "dark" ? "dark" : "light"}
    disableTransitionOnChange
  >
    <CssBaseline enableColorScheme />
    <Box component="main" sx={{ p: 2, minWidth: 0 }}>
      {parametros.get("aba") === "turmas" ? (
        <AbaTurmas
          series={dados}
          turmas={parametros.has("sem-turmas") || !dados.length ? [] : turmas}
          onMudanca={atualizar}
          onOrdenacao={atualizar}
        />
      ) : (
        <AbaSeries series={dados} onMudanca={atualizar} />
      )}
    </Box>
  </ThemeProvider>,
);
