// Monta a visão de frequência parcial com serviços simulados.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import VistaFrequenciaParcial from "../../../src/components/chamada-parcial/vista-frequencia-parcial";
import "../../../src/app/globals.css";

function Cena() {
  const [ativa, setAtiva] = useState(true);
  return (
    <>
      <button onClick={() => setAtiva(!ativa)}>Alternar visão</button>
      <VistaFrequenciaParcial
        series={[]}
        turmas={[]}
        alunos={[]}
        diaInicial="2026-10-27"
        ativa={ativa}
        fuso="America/Fortaleza"
        feriados={[]}
        mostrarSaidas={false}
        justificativas={[]}
      />
    </>
  );
}
const elemento = document.getElementById("root");
if (!elemento) throw new Error("Raiz ausente");
const root = createRoot(elemento);
// Inspeção do estado montado distingue unmount de simples remoção do portal Radix.
Object.assign(window, { raizTeste: root });
root.render(<Cena />);
