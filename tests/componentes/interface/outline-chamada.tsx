// Componentes reais com dados exclusivamente sintéticos; a rede é controlada pelo teste.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SeletorTurmaChamada } from "@/components/chamada/seletor-turma-chamada";
import VistaFrequenciaParcial from "@/components/chamada-parcial/vista-frequencia-parcial";
import type { Aluno, Frequencia, Turma } from "@/domain/frequencia";
import "@/app/globals.css";

const dia = "2026-10-27";
const turmas: Turma[] = ["A", "B", "C"].map((nome) => ({
  id: nome,
  nome,
  rotulo: `1º ano ${nome}`,
  serieId: "s",
  serieNome: "1º ano",
  horarios: [],
}));
const alunos: Aluno[] = ["A", "B", "C"].map((id, ordem) => ({
  id,
  nome: `Aluno ${id}`,
  turmaId: id,
  turmaOriginalId: id,
  ativo: true,
  ordem,
}));
const frequencias: Frequencia[] = [
  {
    dia,
    turmaId: "B",
    revisao: 1,
    atualizadoEm: dia,
    atualizadoPorNome: null,
    faltas: [],
    alunos: ["B"],
  },
];
function Cena() {
  const [turmaId, setTurma] = useState("A");
  const [travado, setTravado] = useState(false);
  return (
    <main className="space-y-6 p-4">
      <button onClick={() => setTravado(!travado)}>Alternar bloqueio</button>
      <SeletorTurmaChamada
        turmas={turmas}
        alunos={alunos}
        turmaId={turmaId}
        dia={dia}
        frequencias={frequencias}
        coberturaDisponivel
        carregando={false}
        temAlteracoes={false}
        travado={travado}
        onEscolher={setTurma}
      />
      <VistaFrequenciaParcial
        series={[]}
        turmas={turmas}
        alunos={alunos}
        diaInicial={dia}
        ativa
        fuso="America/Sao_Paulo"
        feriados={[]}
        mostrarSaidas={false}
        justificativas={[]}
      />
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Raiz ausente");
createRoot(root).render(<Cena />);
