// Monta a aba real de turmas com dados fictícios, sem aplicativo ou banco.
import { createRoot } from "react-dom/client";
import AbaTurmas from "../../../src/components/gestao/abas/aba-turmas";
import type { Serie, Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

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
  <main className="p-4">
    <AbaTurmas
      series={series}
      turmas={turmas}
      onMudanca={async () => {}}
      onOrdenacao={async () => {}}
    />
  </main>,
);
