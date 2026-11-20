// Tema Material UI: variáveis CSS, esquemas claro e escuro, contraste,
// daltonismo e tokens de layout e tipografia da fundação visual.
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { coresGrafico } from "@/theme/paleta";
import { contraste, deltaE, hslParaRgb, lerHsl, piorSeparacao, type Rgb } from "../../helpers/cor";

type NomeEsquema = "light" | "dark";

const ESQUEMAS: { nome: string; esquema: NomeEsquema }[] = [
  { nome: "claro", esquema: "light" },
  { nome: "escuro", esquema: "dark" },
];

const SEPARACAO_DALTONISMO = 8;
const SEPARACAO_NORMAL = 15;
const CONTRASTE_MARCA = 3;
const CONTRASTE_TEXTO = 4.5;

function paleta(esquema: NomeEsquema) {
  const atual = tema.colorSchemes[esquema]?.palette;
  if (!atual) throw new Error(`Esquema ${esquema} ausente no tema`);
  return atual;
}

function cor(valor: string | undefined, rotulo: string): Rgb {
  if (!valor) throw new Error(`Cor ${rotulo} ausente no tema`);
  return hslParaRgb(...lerHsl(valor));
}

describe("tema Material UI", () => {
  it("gera variáveis CSS com o prefixo e o seletor do projeto", () => {
    expect(tema.cssVarPrefix).toBe("template");
    expect(tema.colorSchemeSelector).toBe("data-mui-color-scheme");
    expect(tema.defaultColorScheme).toBe("light");
    expect(tema.vars.palette.falta.main).toContain("var(--template-palette-falta-main");
    expect(tema.vars.palette.justificada.main).toContain("var(--template-palette-justificada-main");
    expect(tema.vars.palette.alerta.main).toContain("var(--template-palette-alerta-main");
  });

  it("gera as folhas de estilo dos dois esquemas com as variáveis semânticas", () => {
    const serializado = JSON.stringify(tema.generateStyleSheets());
    expect(tema.getColorSchemeSelector("light")).toBe('[data-mui-color-scheme="light"] &');
    expect(tema.getColorSchemeSelector("dark")).toBe('[data-mui-color-scheme="dark"] &');
    expect(serializado).toContain("--template-palette-falta-main");
    expect(serializado).toContain("--template-palette-justificada-main");
    expect(serializado).toContain("--template-palette-alerta-main");
    expect(serializado).toContain("--template-palette-baseShadow");
  });

  it("expõe os tokens semânticos completos nos dois esquemas", () => {
    for (const { esquema } of ESQUEMAS) {
      const atual = paleta(esquema);
      for (const token of ["falta", "justificada", "alerta"] as const) {
        expect(atual[token].main).toBeTruthy();
        expect(atual[token].light).toBeTruthy();
        expect(atual[token].dark).toBeTruthy();
        expect(atual[token].contrastText).toBeTruthy();
        expect(atual[token].fraco).toBeTruthy();
        expect(atual[token].texto).toBeTruthy();
      }
    }
  });

  it("mantém forma, breakpoints, espaçamento e sombra do template", () => {
    expect(tema.shape.borderRadius).toBe(8);
    expect(tema.breakpoints.values).toEqual({ xs: 0, sm: 600, md: 905, lg: 1240, xl: 1440 });
    expect(tema.spacing(1)).toBe("var(--template-spacing, 8px)");
    expect(tema.shadows[1]).toContain("--template-palette-baseShadow");
  });

  it("aplica Inter e os tamanhos da tipografia", () => {
    expect(tema.typography.fontFamily).toContain("var(--font-inter)");
    expect(tema.typography.h1.fontSize).toBe("3rem");
    expect(tema.typography.h1.fontWeight).toBe(600);
    expect(tema.typography.body1.fontSize).toBe("0.875rem");
    expect(tema.typography.button.textTransform).toBe("none");
  });

  it("registra as customizações de componentes, gráficos e seletores de data", () => {
    expect(tema.components?.MuiButton).toBeDefined();
    expect(tema.components?.MuiOutlinedInput).toBeDefined();
    expect(tema.components?.MuiDialog).toBeDefined();
    expect(tema.components?.MuiTable).toBeDefined();
    expect(tema.components?.MuiTabs).toBeDefined();
    expect(tema.components?.MuiSwitch).toBeDefined();
    expect(tema.components?.MuiAccordion).toBeDefined();
    expect(tema.components?.MuiTooltip).toBeDefined();
    expect(tema.components?.MuiChip).toBeDefined();
    expect(tema.components?.MuiAlert).toBeDefined();
    expect(tema.components?.MuiSnackbarContent).toBeDefined();
    expect(tema.components?.MuiSelect).toBeDefined();
    expect(tema.components?.MuiAutocomplete).toBeDefined();
    expect(tema.components?.MuiChartsAxis).toBeDefined();
    expect(tema.components?.MuiPickerPopper).toBeDefined();
    expect(tema.components?.MuiPickerDay).toBeDefined();
  });

  it("deriva as cores de gráfico da paleta ativa", () => {
    const cores = coresGrafico(tema);
    expect(cores).toHaveLength(6);
    expect(new Set(cores).size).toBe(6);
    expect(cores[0]).toBe(tema.vars.palette.primary.main);
    expect(cores[1]).toBe(tema.vars.palette.falta.main);
    expect(cores[2]).toBe(tema.vars.palette.justificada.main);
  });
});

describe.each(ESQUEMAS)("paleta do tema $nome", ({ esquema }) => {
  const atual = paleta(esquema);
  const papel = cor(atual.background.paper, "background.paper");

  it("separa falta e falta justificada também para daltonismo", () => {
    const falta = cor(atual.falta.main, "falta.main");
    const justificada = cor(atual.justificada.main, "justificada.main");
    expect(piorSeparacao(falta, justificada).valor).toBeGreaterThanOrEqual(SEPARACAO_DALTONISMO);
    expect(deltaE(falta, justificada)).toBeGreaterThanOrEqual(SEPARACAO_NORMAL);
  });

  it("destaca falta, justificada e alerta da superfície do papel", () => {
    expect(contraste(cor(atual.falta.main, "falta.main"), papel)).toBeGreaterThanOrEqual(
      CONTRASTE_MARCA,
    );
    expect(
      contraste(cor(atual.justificada.main, "justificada.main"), papel),
    ).toBeGreaterThanOrEqual(CONTRASTE_MARCA);
    expect(contraste(cor(atual.alerta.main, "alerta.main"), papel)).toBeGreaterThanOrEqual(
      CONTRASTE_MARCA,
    );
  });

  it("mantém o texto dos tokens semânticos legível", () => {
    expect(
      contraste(cor(atual.justificada.texto, "justificada.texto"), papel),
    ).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    expect(
      contraste(
        cor(atual.justificada.texto, "justificada.texto"),
        cor(atual.justificada.fraco, "justificada.fraco"),
      ),
    ).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    for (const token of ["falta", "justificada", "alerta"] as const) {
      expect(
        contraste(
          cor(atual[token].contrastText, `${token}.contrastText`),
          cor(atual[token].main, `${token}.main`),
        ),
      ).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    }
  });

  it("mantém os botões primário, secundário e de erro com contraste AA", () => {
    for (const token of ["primary", "secondary", "error"] as const) {
      expect(
        contraste(
          cor(atual[token].contrastText, `${token}.contrastText`),
          cor(atual[token].main, `${token}.main`),
        ),
      ).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    }
  });

  it("distingue o sucesso do verde da marca", () => {
    const sucesso = cor(atual.success.main, "success.main");
    const marca = cor(atual.primary.main, "primary.main");
    expect(deltaE(sucesso, marca)).toBeGreaterThanOrEqual(12);
    expect(piorSeparacao(sucesso, marca).valor).toBeGreaterThanOrEqual(8);
  });
});
