// Monta a Grade real com três turmas de origem e um aluno remanejado.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaGrade from "@/components/grade/vista-grade";
import { tema } from "@/theme/tema";
import { ROTULO_A, ROTULO_B, ROTULO_CURTO } from "./seletor-grade-dados";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <main style={{ padding: 16 }}>
      <VistaGrade
        origens={[
          { id: "a", rotulo: ROTULO_A },
          { id: "b", rotulo: ROTULO_B },
          { id: "c", rotulo: ROTULO_CURTO },
        ].map(({ id, rotulo }) => ({
          id,
          nome: rotulo,
          rotulo,
          serieId: "serie",
          serieNome: "Ensino médio",
          horarios: [],
        }))}
        alunos={[
          { id: "a1", nome: "Aluno de origem A", turmaId: "b", turmaOriginalId: "a" },
          { id: "b1", nome: "Aluno de origem B", turmaId: "b", turmaOriginalId: "b" },
          { id: "b2", nome: "Outro aluno de origem B", turmaId: "b", turmaOriginalId: "b" },
          { id: "c1", nome: "Aluno da turma curta", turmaId: "c", turmaOriginalId: "c" },
        ].map((aluno, ordem) => ({ ...aluno, ordem, ativo: true }))}
        frequencias={[]}
        resumo={null}
        mes="2026-11"
        mesCorrente="2026-11"
        hoje="2026-11-22"
        aberto
        versao={0}
        onMes={() => {}}
      />
    </main>
  </ThemeProvider>,
);
