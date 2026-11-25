// Fixture da visibilidade dos gráficos: abas MUI, carrossel e carregamento sob demanda.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import CircleRoundedIcon from "@mui/icons-material/CircleRounded";
import Box from "@mui/material/Box";
import { Abas, type ItemAba } from "@/components/ui/mui/abas";
import FaixaGraficos from "@/components/painel/faixa-graficos";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";
import GraficoSobDemanda from "@/components/graficos/grafico-sob-demanda";
import { ProvedorVisibilidadeGraficos } from "@/components/graficos/visibilidade-graficos";
import { tema } from "@/theme/tema";
import { useState, type ReactNode } from "react";

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
    <Box component="main" sx={{ p: 2 }}>
      <button type="button" onClick={() => setVisivel(true)}>
        Mostrar gráfico
      </button>
      <Box hidden={!visivel}>
        <ProvedorVisibilidadeGraficos visivel={visivel}>
          {grafico("Rosca inicialmente oculta")}
        </ProvedorVisibilidadeGraficos>
      </Box>
    </Box>
  );
}
function GraficoComFalha({ falhar }: { falhar: boolean }) {
  if (falhar) throw new Error("Falha deliberada do gráfico");
  return <p>Gráfico recuperado sem reiniciar o limite</p>;
}
function CenarioErro() {
  const [falhar, setFalhar] = useState(true);
  const [tela, setTela] = useState<"painel" | "chamada">("painel");
  const itens: ItemAba<"painel" | "chamada">[] = [
    {
      valor: "painel",
      rotulo: "Painel",
      icone: <CircleRoundedIcon />,
      conteudo: (
        <GraficoSobDemanda espera={<p>Carregando</p>}>
          <GraficoComFalha falhar={falhar} />
        </GraficoSobDemanda>
      ),
    },
    {
      valor: "chamada",
      rotulo: "Chamada",
      icone: <CircleRoundedIcon />,
      conteudo: <p>Outra tela</p>,
    },
  ];
  return (
    <Box component="main" sx={{ p: 2 }}>
      <button type="button" onClick={() => setFalhar(false)}>
        Corrigir causa
      </button>
      <Abas
        itens={itens}
        ativo={tela}
        onChange={setTela}
        rotuloAcessivel="Telas"
        dataPager="erro"
      />
    </Box>
  );
}
function CenarioPrincipal() {
  const [tela, setTela] = useState<"painel" | "chamada">("painel");
  const [abaInterna, setAbaInterna] = useState<"graficos" | "outra">("graficos");
  const internas: ItemAba<"graficos" | "outra">[] = [
    {
      valor: "graficos",
      rotulo: "Gráficos",
      icone: <CircleRoundedIcon />,
      conteudo: (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label>
            Observação <input aria-label="Observação" />
          </label>
          <FaixaControlada
            itens={[
              { id: "primeiro", rotulo: "Primeiro", render: () => grafico("Rosca primeiro") },
              { id: "segundo", rotulo: "Segundo", render: () => grafico("Rosca segundo") },
            ]}
          />
        </Box>
      ),
    },
    {
      valor: "outra",
      rotulo: "Outra",
      icone: <CircleRoundedIcon />,
      conteudo: <p>Outra aba</p>,
    },
  ];
  const telas: ItemAba<"painel" | "chamada">[] = [
    {
      valor: "painel",
      rotulo: "Painel",
      icone: <CircleRoundedIcon />,
      conteudo: (
        <Abas
          itens={internas}
          ativo={abaInterna}
          onChange={setAbaInterna}
          rotuloAcessivel="Abas internas"
          dataPager="interno"
        />
      ),
    },
    {
      valor: "chamada",
      rotulo: "Chamada",
      icone: <CircleRoundedIcon />,
      conteudo: <p>Chamada aberta</p>,
    },
  ];
  return (
    <Box component="main" sx={{ p: 2 }}>
      <Abas
        itens={telas}
        ativo={tela}
        onChange={setTela}
        rotuloAcessivel="Telas"
        dataPager="telas"
      />
    </Box>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Raiz ausente");
document.documentElement.setAttribute("data-mui-color-scheme", "light");
createRoot(root).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    {location.search === "?lazy-oculto" ? (
      <CenarioLazyOculto />
    ) : location.search === "?erro" ? (
      <CenarioErro />
    ) : location.search === "?aquecimento" ? (
      <Box component="main" sx={{ pt: 250 }}>
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
      </Box>
    ) : (
      <CenarioPrincipal />
    )}
  </ThemeProvider>,
);
