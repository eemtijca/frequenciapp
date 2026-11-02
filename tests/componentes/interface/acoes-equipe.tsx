// Monta a aba real com dados sintéticos fornecidos pelo teste.
import { createRoot } from "react-dom/client";
import AbaEquipe from "../../../src/components/gestao/abas/aba-equipe";
import "../../../src/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <main className="p-4">
    <AbaEquipe usuarioId="admin" onMudanca={async () => {}} />
  </main>,
);
