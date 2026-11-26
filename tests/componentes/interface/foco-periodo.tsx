// Monta o seletor de período com dados sintéticos para verificar foco e calendário.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { tema } from "@/theme/tema";

const cenarios = {
  "troca-de-mes": { valor: "2026-12-01", min: "2026-10-01", max: "2026-12-20", semDomingo: true },
  "so-domingo": { valor: "2026-11-01", min: "2026-11-01", max: "2026-11-01", semDomingo: true },
  "resumo-futuro": {
    valor: "2026-11-01",
    min: "2026-11-01",
    max: "2026-11-02",
    atual: "2026-10-31",
    calendarioSemanal: true,
  },
};

function Fixture() {
  const cenario = new URLSearchParams(location.search).get("cenario");
  const datas = Object.entries(cenarios).find(([nome]) => nome === cenario)?.[1];
  const [dia, setDia] = useState(datas?.valor ?? "2026-10-15");
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
        max="2026-12-31"
        atual="2026-12-31"
        {...datas}
        id="dia"
        modo="dia"
        valor={dia}
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
