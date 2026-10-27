// Monta seletor e seção com dados sintéticos para testar reversões.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "lucide-react";
import { SeletorTurmaChamada } from "../../../src/components/chamada/seletor-turma-chamada";
import { SecaoRecolhivel } from "../../../src/components/ui/secao-recolhivel";
import type { Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

const turmas: Turma[] = ["A", "B", "C"].map((letra, ordem) => ({
  id: `turma-${letra}`,
  serieId: "serie-1",
  nome: `Turma ${letra}`,
  rotulo: `1ª série ${letra}`,
  serieNome: "1º ano",
  horarios: [],
  ordem,
}));
function Cena() {
  const [turmaId, setTurmaId] = useState("turma-A");
  const [aberto, setAberto] = useState(false);
  return (
    <main style={{ width: 360 }}>
      <SeletorTurmaChamada
        turmas={turmas}
        alunos={[]}
        turmaId={turmaId}
        dia="2026-10-27"
        frequencias={[]}
        coberturaDisponivel
        carregando={false}
        temAlteracoes={false}
        travado={false}
        onEscolher={setTurmaId}
      />
      <button onClick={() => setAberto(false)}>Fechar seção externamente</button>
      <SecaoRecolhivel
        titulo="Teste seção"
        icone={Settings}
        aberto={aberto}
        onAbertoChange={setAberto}
      >
        <button>Controle interno</button>
      </SecaoRecolhivel>
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
createRoot(root).render(
  <StrictMode>
    <Cena />
  </StrictMode>,
);
