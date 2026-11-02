import { createRoot } from "react-dom/client";
import { Circle } from "lucide-react";
import AbasDeslizantes from "@/components/ui/abas-deslizantes";
import FaixaGraficos from "@/components/painel/faixa-graficos";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";
import GraficoSobDemanda from "@/components/graficos/grafico-sob-demanda";
import { ProvedorVisibilidadeGraficos } from "@/components/graficos/visibilidade-graficos";
import { useState } from "react";
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
      <FaixaGraficos
        ativo
        cartoes={[
          { id: "aquecido", nome: "Aquecido", conteudo: grafico("Rosca aquecida") },
          { id: "vazio", nome: "Vazio", conteudo: <GraficoRosca titulo="Vazio" fatias={[]} /> },
        ]}
      />
      <FaixaGraficos ativo cartoes={[]} />
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
              {(aba, ativa) =>
                aba === "graficos" ? (
                  <>
                    <label>
                      Observação <input aria-label="Observação" />
                    </label>
                    <FaixaGraficos
                      ativo={ativa}
                      cartoes={[
                        { id: "primeiro", nome: "Primeiro", conteudo: grafico("Rosca primeiro") },
                        { id: "segundo", nome: "Segundo", conteudo: grafico("Rosca segundo") },
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
