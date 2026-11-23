// Renderiza as vistas reais com o tema do aplicativo, sem shell, sessão ou banco.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaGrade from "@/components/grade/vista-grade";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import { tema } from "@/theme/tema";
import { alunos, frequencias, HOJE, MES, series, turmas } from "./ajustes-grade-historico-dados";

const historico = new URLSearchParams(location.search).get("vista") === "historico";
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <main style={{ padding: 16 }}>
      {historico ? (
        <VistaHistorico
          frequencias={frequencias}
          turmas={turmas}
          series={series}
          mes={MES}
          mesCorrente={MES}
          fuso="America/Fortaleza"
          onMes={() => {}}
          onAbrir={() => {}}
          bloqueado={false}
          rotuloTurma={(id) => turmas.find((turma) => turma.id === id)?.rotulo ?? id}
        />
      ) : (
        <VistaGrade
          origens={turmas}
          alunos={alunos}
          frequencias={frequencias}
          resumo={{
            primeiroDia: "2022-01-03",
            diasLetivos: 1500,
            porAluno: [
              { alunoId: "a0", faltas: 1000, faltasJustificadas: 234, diasComRegistro: 1500 },
            ],
          }}
          mes={MES}
          mesCorrente={MES}
          hoje={HOJE}
          aberto
          versao={0}
          onMes={() => {}}
        />
      )}
    </main>
  </ThemeProvider>,
);
