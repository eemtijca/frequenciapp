// Monta a vista real de Horários com turmas e aulas sintéticas, sem sessão ou banco.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { ProvedorAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import VistaHorarios from "@/components/horarios/vista-horarios";
import { LayoutConteudo } from "@/components/layout/layout-conteudo";
import { rotuloDeTurma, type Horario, type Turma } from "@/domain/frequencia";
import { tema } from "@/theme/tema";

function aula(
  ordem: number,
  inicio: string,
  fim: string,
  disciplinas: Record<string, string>,
): Horario {
  return {
    id: `aula-${ordem}`,
    turmaId: "turma-a",
    ordem,
    inicio,
    fim,
    diasSemana: Object.keys(disciplinas).map(Number),
    disciplinas,
    ativo: true,
  };
}

const serieNome = "Série Sintética de Horários e Atividades Interdisciplinares";
const turmas: Turma[] = [
  {
    id: "turma-a",
    serieId: "serie",
    nome: "A",
    serieNome,
    rotulo: `${serieNome} A`,
    horarios: [
      aula(1, "07:00", "07:50", { "1": "Matemática", "3": "História" }),
      aula(2, "07:50", "08:40", { "1": "Língua Portuguesa", "3": "Geografia" }),
      aula(3, "09:20", "10:10", {
        "1": "Ciências e Projetos de Investigação Interdisciplinar",
        "4": "Química",
      }),
      aula(4, "11:00", "11:50", { "1": "" }),
      aula(5, "13:00", "13:50", { "1": "Física", "2": "Tecnologia" }),
      aula(6, "14:55", "15:45", { "1": "Artes", "6": "W".repeat(80) }),
    ],
  },
  ...["Turma A", "Turma B"].map((nome, indice) => ({
    id: `turma-longa-${indice}`,
    serieId: "serie-longa",
    nome,
    serieNome: "W".repeat(40),
    rotulo: rotuloDeTurma("W".repeat(40), nome),
    horarios: [],
  })),
  {
    id: "turma-b",
    serieId: "serie",
    nome: "B",
    serieNome,
    rotulo: "Turma sem horários",
    horarios: [],
  },
];

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da consulta ausente");

createRoot(raiz).render(
  <ThemeProvider theme={tema} defaultMode="system" disableTransitionOnChange>
    <CssBaseline enableColorScheme />
    <ProvedorAtualizacao ativo="horarios" atualizadoEmInicial="2026-11-23T11:30:00Z">
      <Box component="main" sx={{ ml: { md: "256px" } }}>
        <LayoutConteudo largura="leitura">
          <VistaHorarios
            turmas={turmas}
            diaCorrente="2026-11-23"
            fuso="America/Fortaleza"
            editavel={false}
            onMudanca={() => {}}
          />
        </LayoutConteudo>
      </Box>
    </ProvedorAtualizacao>
  </ThemeProvider>,
);
