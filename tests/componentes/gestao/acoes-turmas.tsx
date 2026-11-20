// Monta a aba real de turmas com dados fictícios, sem aplicativo ou banco.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import "dayjs/locale/pt-br";
import AbaTurmas from "../../../src/components/gestao/abas/aba-turmas";
import type { Serie, Turma } from "../../../src/domain/frequencia";
import { tema } from "../../../src/theme/tema";

document.documentElement.setAttribute("data-mui-color-scheme", "light");

const series: Serie[] = [{ id: "serie-1", nome: "1º ano", ordem: 1 }];
const turmas: Turma[] = [
  {
    id: "turma-a",
    serieId: "serie-1",
    nome: "A",
    rotulo: "1º ano A",
    serieNome: "1º ano",
    horarios: [
      {
        id: "aula-1",
        turmaId: "turma-a",
        ordem: 1,
        inicio: "07:00",
        fim: "07:50",
        diasSemana: [1, 2],
        disciplinas: {},
        ativo: true,
      },
    ],
  },
];
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
createRoot(root).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale="pt-br"
      localeText={ptBR.components.MuiLocalizationProvider.defaultProps.localeText}
    >
      <main style={{ padding: 16 }}>
        <AbaTurmas
          series={series}
          turmas={turmas}
          onMudanca={async () => {}}
          onOrdenacao={async () => {}}
        />
      </main>
    </LocalizationProvider>
  </ThemeProvider>,
);
