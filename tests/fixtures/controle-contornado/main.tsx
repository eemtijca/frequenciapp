import { createRoot } from "react-dom/client";
import VistaAlunos from "@/components/alunos/vista-alunos";
import "@/app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Raiz da amostra não encontrada");
createRoot(root).render(
  <main style={{ padding: 16 }}>
    <VistaAlunos alunos={[]} turmas={[]} fuso="America/Fortaleza" onAtualizar={async () => {}} />
    <div id="amostras" style={{ color: "#703020" }}>
      <button className="controle controle-contornado" type="button">
        Livre
      </button>
      <button className="controle controle-contornado selecionado" type="button">
        Selecionado
      </button>
      <button className="controle controle-contornado" aria-pressed="true" type="button">
        Pressionado
      </button>
      <button
        className="controle controle-contornado"
        role="tab"
        aria-selected="true"
        type="button"
      >
        Selecionado aria
      </button>
      <button
        className="controle controle-contornado"
        role="checkbox"
        aria-checked="true"
        type="button"
      >
        Marcado
      </button>
      <button className="controle controle-contornado" data-state="active" type="button">
        Ativo
      </button>
      <button className="controle controle-contornado" disabled type="button">
        Desabilitado
      </button>
      <button className="controle controle-contornado" aria-disabled="true" type="button">
        Indisponível
      </button>
      <button className="controle" type="button">
        Original
      </button>
      <button className="controle selecionado" type="button">
        Original selecionado
      </button>
    </div>
  </main>,
);
