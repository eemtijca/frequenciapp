// Renderiza o Resumo real, com largura de painel e estados de entrada controlados.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import ResumoRelatorios from "@/components/relatorios/vista-resumo-relatorios";
import { tema } from "@/theme/tema";
import { massaResumo, MES } from "./resumo-relatorios-dados";

const parametros = new URLSearchParams(location.search);
const massa = massaResumo(parametros.has("ampla"));
const estado = parametros.get("estado");

function Fixture() {
  const [mes, setMes] = useState(MES);
  return (
    <ThemeProvider theme={tema}>
      <CssBaseline enableColorScheme />
      <Box
        component="main"
        sx={{ ml: { xs: 2, md: 38 }, mr: { xs: 2, md: 6 }, pt: { xs: 13, md: 16 } }}
      >
        <ResumoRelatorios
          {...massa}
          mes={mes}
          mesCorrente={MES}
          diaCorrente={`${MES}-23`}
          frequencias={mes === MES ? massa.frequencias : []}
          bloqueado={estado === "bloqueado"}
          carregando={estado === "carregando"}
          erro={estado === "erro" ? "Falha sintética na leitura do mês." : null}
          onMes={setMes}
        />
      </Box>
    </ThemeProvider>
  );
}

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(<Fixture />);
