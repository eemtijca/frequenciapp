// Monta a aba real, com rede interceptada pelo teste e dados exclusivamente fictícios.
import { createRoot } from "react-dom/client";
import AbaConfiguracoes from "../../../src/components/gestao/abas/aba-configuracoes";
import { CONFIGURACOES_PADRAO, type Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

const turmas: Turma[] = ["A", "B", "C"].map((nome, i) => ({
  id: `turma-${i}`,
  serieId: "serie-1",
  nome,
  rotulo: `1º ano ${nome}`,
  serieNome: "1º ano",
  horarios: [],
}));
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
createRoot(root).render(
  <main className="p-4">
    <AbaConfiguracoes
      configuracoes={CONFIGURACOES_PADRAO}
      justificativas={[]}
      liberadores={[]}
      series={[{ id: "serie-1", nome: "1º ano", ordem: 1 }]}
      turmas={turmas}
      diaCorrente="2026-03-10"
      fuso="America/Sao_Paulo"
      onMudanca={() => {}}
      onJustificativasMudaram={async () => {}}
      onLiberadoresMudaram={async () => {}}
      onHorariosMudaram={() => {}}
    />
  </main>,
);
