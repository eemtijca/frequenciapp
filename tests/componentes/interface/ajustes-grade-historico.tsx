// Renderiza as vistas reais com o tema do aplicativo, sem shell, sessão ou banco.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import VistaGrade from "@/components/grade/vista-grade";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import { tema } from "@/theme/tema";
import type { Horario } from "@/domain/frequencia";
import { alunos, frequencias, HOJE, MES, series, turmas } from "./ajustes-grade-historico-dados";

const aulasDaProporcao: Horario[] = [1, 2, 3, 4, 5].map((ordem) => {
  const disciplinas: Record<string, string> = {};
  if (ordem === 1) disciplinas["1"] = "Matemática";
  return {
    id: `aula-${ordem}`,
    turmaId: "s1",
    ordem,
    inicio: `0${6 + ordem}:00`.slice(-5),
    fim: `0${6 + ordem}:50`.slice(-5),
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
    disciplinas,
  };
});
const turmasComAulas = turmas.map((turma) =>
  turma.id === "s1" ? { ...turma, horarios: aulasDaProporcao } : turma,
);
const alunoParcial = {
  id: "parcial",
  nome: "Ana Proporção",
  turmaId: "s1",
  turmaOriginalId: "s1",
  ativo: true,
  ordem: 0,
};
const frequenciasParciais = [
  {
    dia: "2026-11-02",
    turmaId: "s1",
    revisao: 1,
    atualizadoEm: "2026-11-02T14:30:00.000Z",
    atualizadoPorNome: null,
    alunos: [alunoParcial.id],
    aulas: aulasDaProporcao.map((aula) => aula.id),
    faltas: [{ alunoId: alunoParcial.id, horarios: ["aula-1", "aula-2"], justificativa: "CM" }],
  },
  {
    dia: "2026-11-03",
    turmaId: "s1",
    revisao: 1,
    atualizadoEm: "2026-11-03T14:30:00.000Z",
    atualizadoPorNome: null,
    alunos: [alunoParcial.id],
    aulas: aulasDaProporcao.map((aula) => aula.id),
    faltas: [{ alunoId: alunoParcial.id, horarios: aulasDaProporcao.map((aula) => aula.id) }],
  },
  {
    dia: "2026-11-04",
    turmaId: "s1",
    revisao: 1,
    atualizadoEm: "2026-11-04T14:30:00.000Z",
    atualizadoPorNome: null,
    alunos: [alunoParcial.id],
    aulas: aulasDaProporcao.map((aula) => aula.id),
    faltas: [
      {
        alunoId: alunoParcial.id,
        horarios: aulasDaProporcao.map((aula) => aula.id),
        justificativa: "D",
      },
    ],
  },
];

const vista = new URLSearchParams(location.search).get("vista");
const historico = vista === "historico";
const faltas = vista === "faltas";
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
          origens={faltas ? turmasComAulas : turmas}
          alunos={faltas ? [alunoParcial] : alunos}
          frequencias={faltas ? frequenciasParciais : frequencias}
          resumo={{
            primeiroDia: "2022-01-03",
            diasLetivos: 1500,
            porAluno: faltas
              ? [
                  {
                    alunoId: alunoParcial.id,
                    faltas: 4,
                    faltasJustificadas: 3,
                    diasComRegistro: 20,
                  },
                ]
              : [{ alunoId: "a0", faltas: 1000, faltasJustificadas: 234, diasComRegistro: 1500 }],
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
