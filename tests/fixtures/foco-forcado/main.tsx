// Fixture sintética: componente e estilos reais, sem aplicação nem banco.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SelecionarBuscavel } from "../../../src/components/ui/selecionar-buscavel";
import "../../../src/app/globals.css";

function Fixture() {
  const [valor, setValor] = useState("um");
  return (
    <main data-fixture="pronta" className="p-8">
      <SelecionarBuscavel
        ariaLabel="Turma"
        value={valor}
        onValueChange={setValor}
        opcoes={[
          { valor: "um", rotulo: "Um" },
          { valor: "dois", rotulo: "Dois" },
        ]}
      />
    </main>
  );
}

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
createRoot(raiz).render(<Fixture />);
