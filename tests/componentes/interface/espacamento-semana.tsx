// Reproduz as dimensões da página de chamada com dados sintéticos e o resumo real.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { VistaResumoSemana } from "../../../src/components/chamada/resumo-semana";
import { CONFIGURACOES_PADRAO, type Aluno, type Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

const dias = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
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
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
  })),
};
const alunos: Aluno[] = Array.from({ length: 20 }, (_, i) => ({
  id: `aluno-${i}`,
  nome: `Aluno ${i}`,
  turmaId: turma.id,
  turmaOriginalId: turma.id,
  ordem: i + 1,
  ativo: true,
  desistenteEm: null,
}));
function Exemplo() {
  const [aberto, setAberto] = useState("");
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <aside className="hidden w-60 shrink-0 border-r lg:block">Menu</aside>
      <main className="min-w-0 flex-1 px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-2xl xl:max-w-6xl">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            <div className="flex min-w-0 flex-col gap-4 xl:order-2">
              <div className="superficie p-4">Turmas e navegação</div>
            </div>
            <div className="min-w-0 xl:order-1">
              <VistaResumoSemana
                turmas={[turma]}
                alunos={alunos}
                dias={dias}
                domingo="2026-11-01"
                feriados={[]}
                configuracoes={CONFIGURACOES_PADRAO}
                mostrarSaidas={false}
                contexto="chamada"
                fuso="America/Sao_Paulo"
                onAbrirDia={setAberto}
              />
              <output aria-label="Dia aberto">{aberto}</output>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(<Exemplo />);
