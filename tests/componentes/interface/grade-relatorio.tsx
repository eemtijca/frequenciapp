// Renderiza a Grade real com F, FJ, S, P, vazio e aluno sem faltas.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaGrade from "@/components/grade/vista-grade";
import { tema } from "@/theme/tema";
import {
  alunos,
  frequencias,
  HOJE,
  justificativas,
  MES,
  resumo,
  turmas,
} from "./grade-relatorio-dados";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <main style={{ padding: 16 }}>
      <VistaGrade
        origens={turmas}
        alunos={alunos}
        frequencias={frequencias}
        resumo={resumo}
        mes={MES}
        mesCorrente={MES}
        hoje={HOJE}
        aberto
        versao={0}
        justificativas={justificativas}
        onMes={() => {}}
      />
    </main>
  </ThemeProvider>,
);
