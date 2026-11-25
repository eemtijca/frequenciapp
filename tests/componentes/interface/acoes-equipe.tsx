// Monta a aba real com dados sintéticos fornecidos pelo teste.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import AbaEquipe from "../../../src/components/gestao/abas/aba-equipe";
import { tema } from "../../../src/theme/tema";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <main style={{ padding: 16 }}>
      <AbaEquipe usuarioId="admin" onMudanca={async () => {}} />
    </main>
  </ThemeProvider>,
);
