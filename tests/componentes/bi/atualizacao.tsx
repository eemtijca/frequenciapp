// Monta o componente real do FrequenciBI com respostas HTTP sintéticas.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaBi from "@/components/bi/vista-bi";
import { tema } from "../../../src/theme/tema";

document.documentElement.setAttribute("data-mui-color-scheme", "light");

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline />
    <Box sx={{ minHeight: "100dvh" }}>
      <VistaBi fuso="UTC" />
    </Box>
  </ThemeProvider>,
);
