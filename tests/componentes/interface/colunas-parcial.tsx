// Renderiza a visão real com alunos sintéticos e sem acesso a banco.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaFrequenciaParcial from "../../../src/components/chamada-parcial/vista-frequencia-parcial";
import type { Aluno, Serie, Turma } from "../../../src/domain/frequencia";
import { tema } from "../../../src/theme/tema";
import "../../../src/app/globals.css";

const serie: Serie = { id: "serie", nome: "1º ano", ordem: 1 };
const turma: Turma = {
  id: "turma",
  serieId: serie.id,
  nome: "A",
  rotulo: "1º ano A",
  serieNome: serie.nome,
  horarios: [],
};
const alunos: Aluno[] = [
  "Presente",
  "Justificado",
  "Parcial",
  "Sem registro",
  "Maria Eduarda de Albuquerque e Silva",
].map((nome, indice) => ({
  id: `aluno-${indice}`,
  nome: `Aluno ${nome}`,
  turmaId: turma.id,
  turmaOriginalId: turma.id,
  ordem: indice,
  ativo: true,
}));
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
createRoot(raiz).render(
  // A caixa reproduz a largura de leitura do shell, sem carregar sessão ou banco.
  <ThemeProvider theme={tema} defaultMode="system" modeStorageKey="theme" disableTransitionOnChange>
    <CssBaseline enableColorScheme />
    <Box sx={{ p: { xs: 2, sm: 3 }, width: "100%" }}>
      <Box data-testid="conteudo-fixture" sx={{ width: "100%", maxWidth: 1280, mx: "auto" }}>
        <VistaFrequenciaParcial
          series={[serie]}
          turmas={[turma]}
          alunos={alunos}
          diaInicial="2026-10-27"
          ativa
          fuso="America/Fortaleza"
          feriados={[]}
          mostrarSaidas={false}
          justificativas={[]}
        />
      </Box>
    </Box>
  </ThemeProvider>,
);
