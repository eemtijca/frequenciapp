// Seletor de tema MUI: opções, leitura acessível, hidratação e fonte única do modo.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";

function ler(arquivo: string): string {
  return readFileSync(path.resolve(process.cwd(), arquivo), "utf8");
}

function comCabecalho(fonte: string): boolean {
  const linhas = fonte.split("\n");
  let inicio = linhas[0]?.startsWith('"use client"') ? 1 : 0;
  while (linhas[inicio]?.trim() === "") inicio += 1;
  return linhas[inicio]?.trim().startsWith("//") === true;
}

describe("SeletorTema", () => {
  it("renderiza o gatilho sem depender do tema antes da montagem", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, { theme: tema }, createElement(SeletorTema)),
    );
    expect(html).toContain("MuiIconButton-root");
    expect(html).toContain('aria-label="Alterar tema"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("MuiSvgIcon-root");
  });

  it("mantém as três opções, os rótulos e os ícones arredondados", () => {
    const fonte = ler("src/components/ui/mui/seletor-tema.tsx");
    expect(fonte).toContain('rotulo: "Sistema"');
    expect(fonte).toContain('rotulo: "Claro"');
    expect(fonte).toContain('rotulo: "Escuro"');
    for (const icone of ["MonitorRounded", "LightModeRounded", "DarkModeRounded", "CheckRounded"]) {
      expect(fonte).toContain(`@mui/icons-material/${icone}`);
    }
  });

  it("usa Menu, IconButton e apenas o modo do Material UI", () => {
    const fonte = ler("src/components/ui/mui/seletor-tema.tsx");
    expect(fonte).toContain('from "@mui/material/IconButton"');
    expect(fonte).toContain('from "@mui/material/Menu"');
    expect(fonte).toContain('from "@mui/material/MenuItem"');
    expect(fonte).toContain('from "@mui/material/styles"');
    expect(fonte).toContain("useColorScheme");
    expect(fonte).toContain("setMode(valor)");
    expect(fonte).not.toContain("next-themes");
    expect(fonte).not.toContain("setTheme");
  });

  it("expõe opções como rádio e evita divergência de hidratação", () => {
    const fonte = ler("src/components/ui/mui/seletor-tema.tsx");
    expect(fonte).toContain('role="radio"');
    expect(fonte).toContain("aria-checked={ativo}");
    expect(fonte).toContain("useSyncExternalStore");
    expect(fonte).toContain("montado");
    expect(fonte).toContain("aria-haspopup");
    expect(fonte).toContain("aria-checked");
  });

  it("mantém cabeçalho e não reintroduz a interface antiga", () => {
    const fonte = ler("src/components/ui/mui/seletor-tema.tsx");
    expect(comCabecalho(fonte)).toBe(true);
    expect(fonte).not.toContain("lucide-react");
    expect(fonte).not.toContain("@/components/ui/");
    expect(fonte).not.toContain("className=");
    expect(fonte).not.toContain("@ts-ignore");
    expect(fonte).not.toMatch(/\bany\b/);
  });
});

describe("layout da raiz", () => {
  const layout = ler("src/app/layout.tsx");

  it("monta o provedor de avisos dentro do provedor de tema", () => {
    const inicioTema = layout.indexOf("<ProvedorTema");
    const fimTema = layout.indexOf("</ProvedorTema>");
    const avisos = layout.indexOf("<ProvedorAvisos />");
    expect(inicioTema).toBeGreaterThan(-1);
    expect(fimTema).toBeGreaterThan(inicioTema);
    expect(avisos).toBeGreaterThan(inicioTema);
    expect(avisos).toBeLessThan(fimTema);
  });

  it("mantém o script de cor e remove o stack visual antigo", () => {
    expect(layout).toContain("<InitColorSchemeScript");
    expect(layout).toContain('attribute="data-mui-color-scheme"');
    for (const proibido of [
      "next-themes",
      "SincronizarTema",
      "@/components/ui/sonner",
      "Toaster",
      "ModalidadeFoco",
      'from "./globals.css"',
      "bg-background",
      "text-foreground",
      "font-sans",
    ]) {
      expect(layout, proibido).not.toContain(proibido);
    }
  });

  it("mantém as variáveis das fontes da interface e dos números no corpo", () => {
    expect(layout).toContain("className={`${fonteInterface.variable} ${fonteNumeros.variable}`}");
    expect(layout).toContain("Plus_Jakarta_Sans");
    expect(layout).toContain("JetBrains_Mono");
    expect(layout).not.toContain("font-inter");
  });
});
