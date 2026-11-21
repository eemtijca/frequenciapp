// Tema Material UI do FrequenciApp: variáveis CSS, esquemas claro e escuro,
// tipografia da interface, forma, sombras, breakpoints e customizações de componentes.
import { createTheme, type Shadows } from "@mui/material/styles";
import { colorSchemes } from "./paleta";
import { tipografia } from "./tipografia";
import { BREAKPOINTS, RAIOS } from "./layout";
import { componentes } from "./componentes";

const sombrasPadrao = createTheme().shadows;

export const sombras = sombrasPadrao.map((sombra, indice) =>
  indice === 1 ? "var(--template-palette-baseShadow)" : sombra,
) as Shadows;

export const tema = createTheme({
  cssVariables: {
    colorSchemeSelector: "data-mui-color-scheme",
    cssVarPrefix: "template",
  },
  colorSchemes,
  typography: tipografia,
  shape: {
    borderRadius: RAIOS.controle,
  },
  shadows: sombras,
  breakpoints: {
    values: BREAKPOINTS,
  },
  components: componentes,
});
