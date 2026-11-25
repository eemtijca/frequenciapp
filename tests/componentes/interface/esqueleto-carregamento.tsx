// Monta o esqueleto real com o tema do aplicativo, sem o provedor que exige Next.
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import Carregando from "@/app/loading";
import { tema } from "@/theme/tema";

const destino = document.getElementById("raiz");
if (!destino) throw new Error("Raiz da fixture ausente.");
const root = createRoot(destino);
flushSync(() => {
  root.render(
    <ThemeProvider
      theme={tema}
      defaultMode="dark"
      modeStorageKey="qa-esqueleto-esquema"
      disableTransitionOnChange
    >
      <CssBaseline enableColorScheme />
      <Carregando />
    </ThemeProvider>,
  );
});

const superficie = destino.querySelector("[aria-busy='true']");
const reserva = superficie?.children.item(0);
const coluna = superficie?.children.item(1);
if (!reserva || !coluna) throw new Error("Estrutura do esqueleto incompleta.");
reserva.setAttribute("data-reserva-gaveta", "");
coluna.setAttribute("data-coluna-conteudo", "");
document.documentElement.dataset.fixture = "pronta";
