import { createRoot } from "react-dom/client";
import { Circle } from "lucide-react";
import AbasDeslizantes from "@/components/ui/abas-deslizantes";
import FaixaGraficos from "@/components/painel/faixa-graficos";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";
import GraficoSobDemanda from "@/components/graficos/grafico-sob-demanda";
import { ProvedorVisibilidadeGraficos } from "@/components/graficos/visibilidade-graficos";
import { useState, type ReactNode } from "react";
import "@/app/globals.css";

const abas = [
  { valor: "painel", rotulo: "Painel", icone: Circle },
  { valor: "chamada", rotulo: "Chamada", icone: Circle },
];
const internas = [
  { valor: "graficos", rotulo: "Gráficos", icone: Circle },
  { valor: "outra", rotulo: "Outra", icone: Circle },
];
const grafico = (nome: string) => (
  <GraficoRosca titulo={nome} fatias={[{ nome: "Série A", valor: 3 }]} />
);
function FaixaControlada({
  itens,
}: {
  itens: { id: string; rotulo: string; render: () => ReactNode }[];
}) {
  const [valor, setValor] = useState(itens[0]?.id ?? "");
  return <FaixaGraficos itens={itens} valor={valor} onValor={setValor} />;
}
function CenarioLazyOculto() {
  const [visivel, setVisivel] = useState(false);
  return (
    <main>
      <button onClick={() => setVisivel(true)}>Mostrar gráfico</button>
      <div hidden={!visivel}>
        <ProvedorVisibilidadeGraficos visivel={visivel}>
          {grafico("Rosca inicialmente oculta")}
        </ProvedorVisibilidadeGraficos>
      </div>
    </main>
  );
}
function GraficoComFalha({ falhar }: { falhar: boolean }) {
  if (falhar) throw new Error("Falha deliberada do gráfico");
  return <p>Gráfico recuperado sem reiniciar o limite</p>;
}
function CenarioErro() {
  const [falhar, setFalhar] = useState(true);
  return (
    <main>
      <button onClick={() => setFalhar(false)}>Corrigir causa</button>
      <AbasDeslizantes rotuloAcessivel="Telas" abaInicial="painel" abas={abas} dataPager="erro">
        {(tela) =>
          tela === "painel" ? (
            <GraficoSobDemanda espera={<p>Carregando</p>}>
              <GraficoComFalha falhar={falhar} />
            </GraficoSobDemanda>
          ) : (
            <p>Outra tela</p>
          )
        }
      </AbasDeslizantes>
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Raiz ausente");
createRoot(root).render(
  location.search === "?lazy-oculto" ? (
    <CenarioLazyOculto />
  ) : location.search === "?erro" ? (
    <CenarioErro />
  ) : location.search === "?aquecimento" ? (
    <main style={{ paddingTop: 2500 }}>
      <FaixaControlada
        itens={[
          { id: "aquecido", rotulo: "Aquecido", render: () => grafico("Rosca aquecida") },
          {
            id: "vazio",
            rotulo: "Vazio",
            render: () => <GraficoRosca titulo="Vazio" fatias={[]} />,
          },
        ]}
      />
      <FaixaControlada itens={[]} />
    </main>
  ) : (
    <main style={{ padding: 16 }}>
      <AbasDeslizantes rotuloAcessivel="Telas" abaInicial="painel" abas={abas} dataPager="telas">
        {(tela) =>
          tela === "painel" ? (
            <AbasDeslizantes
              rotuloAcessivel="Abas internas"
              abaInicial="graficos"
              abas={internas}
              dataPager="interno"
            >
              {(aba) =>
                aba === "graficos" ? (
                  <>
                    <label>
                      Observação <input aria-label="Observação" />
                    </label>
                    <FaixaControlada
                      itens={[
                        {
                          id: "primeiro",
                          rotulo: "Primeiro",
                          render: () => grafico("Rosca primeiro"),
                        },
                        {
                          id: "segundo",
                          rotulo: "Segundo",
                          render: () => grafico("Rosca segundo"),
                        },
                      ]}
                    />
                  </>
                ) : (
                  <p>Outra aba</p>
                )
              }
            </AbasDeslizantes>
          ) : (
            <p>Chamada aberta</p>
          )
        }
      </AbasDeslizantes>
    </main>
  ),
);
