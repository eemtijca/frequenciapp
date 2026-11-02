// Monta o resumo real e uma rosca de faltas para testes em navegador.
import { createRoot } from "react-dom/client";
import { VistaResumoSemana } from "../../../src/components/chamada/resumo-semana";
import GraficoRosca from "../../../src/components/painel/grafico-rosca";
import { CONFIGURACOES_PADRAO, type Aluno, type Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

const turma: Turma = {
  id: "turma-a",
  serieId: "serie-1",
  nome: "A",
  rotulo: "1º ano A",
  serieNome: "1º ano",
  horarios: [1, 2].map((n) => ({
    id: `aula-${n}`,
    turmaId: "turma-a",
    ordem: n,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1],
    ativo: true,
  })),
};
const alunos: Aluno[] = Array.from({ length: 101 }, (_, i) => ({
  id: `aluno-${i}`,
  nome: `Aluno ${i}`,
  turmaId: turma.id,
  turmaOriginalId: turma.id,
  ordem: i + 1,
  ativo: true,
  desistenteEm: null,
}));
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <main className="p-4">
    <VistaResumoSemana
      turmas={[turma]}
      alunos={alunos}
      dias={["2026-10-19"]}
      feriados={[]}
      configuracoes={CONFIGURACOES_PADRAO}
      mostrarSaidas={false}
      contexto="painel"
      fuso="America/Sao_Paulo"
      onAbrirDia={() => {}}
    />
    <section aria-label="Rosca de faltas existente">
      <GraficoRosca
        titulo="Faltas por turma"
        fatias={[
          { nome: "Turma A", valor: 1 },
          { nome: "Turma B", valor: 2 },
        ]}
      />
    </section>
    <section aria-label="Rosca de faltas vazia">
      <GraficoRosca titulo="Faltas vazias" fatias={[]} />
    </section>
  </main>,
);
