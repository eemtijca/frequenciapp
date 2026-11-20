// Monta o seletor de período com dados sintéticos para verificar foco e calendário.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { tema } from "@/theme/tema";

function Fixture() {
  const [dia, setDia] = useState("2026-10-15");
  const [mes, setMes] = useState("2026-10");
  const [aberto, setAberto] = useState(false);
  const [cliques, setCliques] = useState(0);
  const fixture = useRef<HTMLElement>(null);
  useEffect(() => {
    const elemento = fixture.current;
    if (!elemento) throw new Error("Fixture ausente");
    elemento.dataset.fixtureMontado = "true";
    return () => {
      delete elemento.dataset.fixtureMontado;
    };
  }, []);
  return (
    <main ref={fixture} style={{ padding: 16, paddingTop: 80 }}>
      <SeletorPeriodo
        id="dia"
        modo="dia"
        valor={dia}
        max="2026-12-31"
        atual="2026-12-31"
        rotuloAcessivel="Dia"
        rotulo={dia}
        onValor={setDia}
        onAbertoChange={setAberto}
      />
      <SeletorPeriodo
        id="mes"
        modo="mes"
        valor={mes}
        max="2026-12"
        atual="2026-12"
        rotuloAcessivel="Mês"
        rotulo={mes}
        onValor={setMes}
      />
      <button
        style={{ position: "fixed", top: 16, right: 16 }}
        type="button"
        onClick={() => setCliques((valor) => valor + 1)}
      >
        Controle externo
      </button>
      <output aria-label="Ativações externas">{cliques}</output>
      <output aria-label="Estado do calendário">{aberto ? "aberto" : "fechado"}</output>
    </main>
  );
}
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <Fixture />
  </ThemeProvider>,
);
