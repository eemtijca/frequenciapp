// Monta as duas superfícies reais de Alunos com massa fictícia e tema do aplicativo.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaAlunos from "@/components/alunos/vista-alunos";
import AbaAlunos from "@/components/gestao/abas/aba-alunos";
import { ProvedorAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { tema } from "@/theme/tema";
import { alunos, turmas } from "./alunos-dados";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente.");
const parametros = new URLSearchParams(location.search);
const atualizar = async () => {};
createRoot(raiz).render(
  <ThemeProvider
    theme={tema}
    defaultMode={parametros.get("tema") === "dark" ? "dark" : "light"}
    disableTransitionOnChange
  >
    <CssBaseline enableColorScheme />
    <Box component="main" sx={{ p: 2, minWidth: 0 }}>
      {parametros.has("gestao") ? (
        <AbaAlunos alunos={alunos} turmas={turmas} onMudanca={atualizar} />
      ) : (
        <ProvedorAtualizacao ativo="alunos" atualizadoEmInicial="2026-11-22T15:10:00Z">
          <VistaAlunos
            alunos={alunos}
            turmas={turmas}
            fuso="America/Fortaleza"
            onAtualizar={atualizar}
          />
        </ProvedorAtualizacao>
      )}
    </Box>
  </ThemeProvider>,
);
