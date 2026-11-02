import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import VistaMinhasTurmas from "@/components/diretor/vista-minhas-turmas";
import VistaEntradas from "@/components/movimentacoes/vista-entradas";
import VistaSaidas from "@/components/movimentacoes/vista-saidas";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import "@/app/globals.css";

const tela = new URLSearchParams(location.search).get("tela");
const vazio = () => {};
const comum = {
  diaCorrente: "2026-10-30",
  fuso: "America/Fortaleza",
  turmas: [],
  alunos: [],
  liberadores: [],
  catalogoJustificativas: [],
};
const contexto = {
  diaCorrente: "2026-10-30",
  trocaObrigatoria: false,
  categorias: [],
  limiteRiscoPercentual: 25,
  turmas: [
    { turmaId: "t1", turma: "1º ano A", inicio: "2026-01-01", fim: null },
    { turmaId: "t2", turma: "2º ano B", inicio: "2026-01-01", fim: null },
  ],
} as ComponentProps<typeof VistaMinhasTurmas>["contexto"];
const series = [
  { id: "s1", nome: "1º ano", ordem: 1 },
  { id: "s2", nome: "2º ano", ordem: 2 },
] as ComponentProps<typeof VistaHistorico>["series"];

const conteudo =
  tela === "diretor" ? (
    <VistaMinhasTurmas contexto={contexto} onAtualizado={vazio} />
  ) : tela === "entradas" ? (
    <VistaEntradas {...comum} />
  ) : tela === "saidas" ? (
    <VistaSaidas {...comum} mes="2026-10" saidas={[]} onSaidasMudaram={async () => {}} />
  ) : (
    <VistaHistorico
      frequencias={[]}
      turmas={[]}
      series={series}
      mes="2026-10"
      mesCorrente="2026-10"
      fuso="America/Fortaleza"
      onMes={vazio}
      onAbrir={vazio}
      bloqueado={false}
      rotuloTurma={(id) => id}
    />
  );

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz não encontrada");
createRoot(raiz).render(<main style={{ padding: 16 }}>{conteudo}</main>);
