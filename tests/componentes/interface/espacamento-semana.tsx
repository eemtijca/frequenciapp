// Reproduz as dimensões da página de chamada com dados sintéticos e o resumo real.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { VistaResumoSemana } from "../../../src/components/chamada/resumo-semana";
import { CONFIGURACOES_PADRAO, type Aluno, type Turma } from "../../../src/domain/frequencia";
import { tema } from "../../../src/theme/tema";

const dias = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
const turma: Turma = {
  id: "turma-a",
  serieId: "serie-1",
  nome: "A",
  rotulo: "1º ano A",
  serieNome: "1º ano",
  horarios: [1, 2].map((n) => ({
    id: `aula-${n}`,
    turmaId: "turma-a",
    ordem: n,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
  })),
};
const alunos: Aluno[] = Array.from({ length: 20 }, (_, i) => ({
  id: `aluno-${i}`,
  nome: `Aluno ${i}`,
  turmaId: turma.id,
  turmaOriginalId: turma.id,
  ordem: i + 1,
  ativo: true,
  desistenteEm: null,
}));
function Exemplo() {
  const [aberto, setAberto] = useState("");
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        flexDirection: { xs: "column", lg: "row" },
      }}
    >
      <Box
        component="aside"
        sx={{
          display: { xs: "none", lg: "block" },
          width: 240,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
        }}
      >
        Menu
      </Box>
      <Box component="main" sx={{ minWidth: 0, flex: 1, px: { xs: 2, sm: 3, lg: 4 }, pt: 2 }}>
        <Box sx={{ mx: "auto", width: "100%", maxWidth: { xs: 672, xl: 1152 } }}>
          <Box
            sx={{
              display: { xs: "flex", xl: "grid" },
              flexDirection: "column",
              gap: 2,
              gridTemplateColumns: { xl: "minmax(0, 1fr) 320px" },
              alignItems: { xl: "flex-start" },
            }}
          >
            <Box
              sx={{
                display: "flex",
                minWidth: 0,
                flexDirection: "column",
                gap: 2,
                order: { xl: 2 },
              }}
            >
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
                Turmas e navegação
              </Box>
            </Box>
            <Box sx={{ minWidth: 0, order: { xl: 1 } }}>
              <VistaResumoSemana
                turmas={[turma]}
                alunos={alunos}
                dias={dias}
                domingo="2026-11-01"
                feriados={[]}
                configuracoes={CONFIGURACOES_PADRAO}
                mostrarSaidas={false}
                contexto="chamada"
                fuso="America/Sao_Paulo"
                onAbrirDia={setAberto}
              />
              <output aria-label="Dia aberto">{aberto}</output>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <Exemplo />
  </ThemeProvider>,
);
