import { createRoot } from "react-dom/client";
import { Button } from "../../../src/components/ui/button";
import "../../../src/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <main className="grid gap-4 p-4">
    <h1>Ações compartilhadas</h1>
    <section className="superficie flex flex-wrap gap-3 p-4">
      <Button variant="secondary">Secundário</Button>
      <Button variant="outline">Contorno</Button>
      <Button>Primário</Button>
      <Button variant="destructive">Destrutivo</Button>
      <Button variant="ghost">Discreto</Button>
      <Button variant="secondary" aria-pressed="true">
        Pressionado
      </Button>
      <Button variant="outline" aria-selected="true">
        Selecionado
      </Button>
      <Button variant="secondary" aria-checked="true">
        Marcado
      </Button>
      <Button variant="outline" data-state="active">
        Ativo
      </Button>
      <Button variant="secondary" className="selecionado">
        Classe selecionada
      </Button>
      <Button variant="outline" disabled>
        Desabilitado
      </Button>
      <Button variant="outline" className="bg-red-600 text-white">
        Semântico
      </Button>
      <button type="button" className="controle h-11 px-4" aria-label="Controle original">
        Controle original
      </button>
      <button
        type="button"
        className="controle h-11 px-4"
        aria-label="Seleção original"
        aria-pressed="true"
      >
        Seleção original
      </button>
    </section>
  </main>,
);
