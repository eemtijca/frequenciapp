// Monta o seletor de turmas com dados sintéticos para testar recolhimento e foco.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { SeletorTurmaChamada } from "../../../src/components/chamada/seletor-turma-chamada";
import type { Turma } from "../../../src/domain/frequencia";
import { tema } from "../../../src/theme/tema";

const turmas: Turma[] = ["A", "B", "C"].map((letra, ordem) => ({
  id: `turma-${letra}`,
  serieId: "serie-1",
  nome: `Turma ${letra}`,
  rotulo: `1ª série ${letra}`,
  serieNome: "1º ano",
  horarios: [],
  ordem,
}));

function Cena() {
  const [turmaId, setTurmaId] = useState("turma-A");
  return (
    <main style={{ width: 360 }}>
      <SeletorTurmaChamada
        turmas={turmas}
        alunos={[]}
        turmaId={turmaId}
        dia="2026-10-27"
        frequencias={[]}
        coberturaDisponivel
        carregando={false}
        temAlteracoes={false}
        travado={false}
        onEscolher={setTurmaId}
      />
      <output aria-label="Turma escolhida">{turmaId}</output>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={tema}>
      <CssBaseline enableColorScheme />
      <Cena />
    </ThemeProvider>
  </StrictMode>,
);
