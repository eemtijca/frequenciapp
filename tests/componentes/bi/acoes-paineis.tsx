// Monta a grade real com dois gráficos e dados fictícios para testes no navegador.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GradePaineisBi } from "@/components/bi/grade-paineis";
import { esquemaFiltrosBi } from "@/domain/bi-analise";
import { graficoBi } from "@/domain/bi-painel";
import type { PainelBi } from "@/domain/bi-personalizacao";
import "@/app/globals.css";

const filtros = esquemaFiltrosBi.parse({});
const inicial: PainelBi = {
  id: "teste",
  nome: "Teste",
  anotacao: "",
  filtros,
  graficos: [
    graficoBi("faltas", "turma", "registros", "indicador", "Primeiro"),
    graficoBi("faltas", "serie", "registros", "indicador", "Segundo"),
  ],
};
const recortes = {
  faltas: { disponivel: true as const, linhas: [], filtros, fonte: "faltas" as const },
};
const calcular = async () => [
  {
    nome: "Turma fictícia",
    grupo: "",
    referencia: "a",
    grupoReferencia: "",
    valor: 1,
    registros: 1,
    alunos: 1,
  },
];
function Fixture() {
  const [painel, setPainel] = useState(inicial);
  const [editado, setEditado] = useState("");
  const [confirmacoes, setConfirmacoes] = useState(0);
  return (
    <>
      <p data-testid="editado">{editado}</p>
      <p data-testid="confirmacoes">{confirmacoes}</p>
      <GradePaineisBi
        painel={painel}
        onAlterar={setPainel}
        recortes={recortes}
        calcular={calcular}
        onFiltrar={() => {}}
        confirmar={() => setConfirmacoes((total) => total + 1)}
        onEditar={(g) => setEditado(g.titulo)}
      />
    </>
  );
}
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(<Fixture />);
