// Monta os cadastros reais com dados fictícios, sem aplicativo ou banco.
import { createRoot } from "react-dom/client";
import AbaSeries from "../../../src/components/gestao/abas/aba-series";
import AbaAlunos from "../../../src/components/gestao/abas/aba-alunos";
import AbaDiretores from "../../../src/components/gestao/abas/aba-diretores";
import type { Aluno, Serie, Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

const series: Serie[] = [{ id: "serie-1", nome: "1º ano", ordem: 1 }];
const turmas: Turma[] = [
  {
    id: "turma-1",
    serieId: "serie-1",
    nome: "A",
    rotulo: "1º ano A",
    serieNome: "1º ano",
    horarios: [],
  },
];
const alunos: Aluno[] = [
  {
    id: "aluno-1",
    nome: "Ana Teste",
    turmaId: "turma-1",
    turmaOriginalId: "turma-1",
    ordem: 1,
    ativo: true,
  },
  {
    id: "aluno-2",
    nome: "Bia Teste",
    turmaId: "turma-1",
    turmaOriginalId: "turma-1",
    ordem: 2,
    ativo: false,
  },
  {
    id: "aluno-3",
    nome: "Caio Teste",
    turmaId: "turma-1",
    turmaOriginalId: "turma-1",
    ordem: 3,
    ativo: false,
    desistenteEm: "2026-01-01",
  },
];
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
const aba = new URLSearchParams(location.search).get("aba");
createRoot(root).render(
  <main className="p-4">
    {aba === "alunos" ? (
      <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={async () => {}} />
    ) : aba === "diretores" ? (
      <AbaDiretores turmas={turmas} diaCorrente="2026-03-10" />
    ) : (
      <AbaSeries series={series} onMudanca={async () => {}} />
    )}
  </main>,
);
