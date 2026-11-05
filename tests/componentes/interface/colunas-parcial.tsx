// Renderiza a visão real com alunos sintéticos e sem acesso a banco.
import { createRoot } from "react-dom/client";
import VistaFrequenciaParcial from "../../../src/components/chamada-parcial/vista-frequencia-parcial";
import type { Aluno, Serie, Turma } from "../../../src/domain/frequencia";
import "../../../src/app/globals.css";

const serie: Serie = { id: "serie", nome: "1º ano", ordem: 1 };
const turma: Turma = {
  id: "turma",
  serieId: serie.id,
  nome: "A",
  rotulo: "1º ano A",
  serieNome: serie.nome,
  horarios: [],
};
const alunos: Aluno[] = ["Presente", "Justificado", "Parcial", "Sem registro"].map(
  (nome, indice) => ({
    id: `aluno-${indice}`,
    nome: `Aluno ${nome}`,
    turmaId: turma.id,
    turmaOriginalId: turma.id,
    ordem: indice,
    ativo: true,
  }),
);
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
createRoot(raiz).render(
  // Reproduz a estrutura e as larguras de aplicacao.tsx, sem carregar sessão ou banco.
  <div className="flex h-dvh w-full flex-col lg:flex-row">
    <aside data-testid="menu-lateral" className="hidden w-60 shrink-0 lg:flex" />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <section className="pagina-painel h-full w-full overflow-y-auto px-4 pt-4 pb-0 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl" data-testid="conteudo-fixture">
            <VistaFrequenciaParcial
              series={[serie]}
              turmas={[turma]}
              alunos={alunos}
              diaInicial="2026-10-27"
              ativa
              fuso="America/Fortaleza"
              feriados={[]}
              mostrarSaidas={false}
              justificativas={[]}
            />
          </div>
        </section>
      </main>
    </div>
  </div>,
);
