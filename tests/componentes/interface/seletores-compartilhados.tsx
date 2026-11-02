import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SeletorAno } from "@/components/ui/seletor-ano";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import "@/app/globals.css";

function Fixture() {
  const [ano, setAno] = useState("2024");
  const [horario, setHorario] = useState("08:30");
  return (
    <main className="grid gap-4 p-4 sm:max-w-sm">
      <SeletorAno
        id="ano"
        valor={ano}
        min={2024}
        max={2030}
        rotuloAcessivel="Ano letivo"
        onValor={setAno}
      />
      <SeletorHorario
        id="hora"
        valor={horario}
        rotuloAcessivel="Horário de entrada"
        onValor={setHorario}
      />
      <SeletorPeriodo
        id="mes"
        modo="mes"
        valor="2026-10"
        max="2026-11"
        rotuloAcessivel="Mês avulso"
        rotulo="Outubro"
        onValor={() => {}}
      />
      <SeletorAno
        id="ano-disabled"
        valor="2024"
        disabled
        rotuloAcessivel="Ano bloqueado"
        onValor={() => {}}
      />
      <SeletorHorario
        id="hora-disabled"
        valor="08:30"
        disabled
        rotuloAcessivel="Horário bloqueado"
        onValor={() => {}}
      />
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Raiz ausente");
createRoot(root).render(<Fixture />);
