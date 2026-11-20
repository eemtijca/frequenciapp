// Seletor de tema MUI: opções, leitura acessível, hidratação e sincronização
// com a preferência do next-themes.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";
import { normalizarModoTema } from "@/components/ui/mui/sincronizar-tema";

function ler(arquivo: string): string {
  return readFileSync(path.resolve(process.cwd(), arquivo), "utf8");
}

function comCabecalho(fonte: string): boolean {
  const linhas = fonte.split("\n");
  let inicio = linhas[0]?.startsWith('"use client"') ? 1 : 0;
  while (linhas[inicio]?.trim() === "") inicio += 1;
  return linhas[inicio]?.trim().startsWith("//") === true;
}

describe("normalizarModoTema", () => {
  it("aceita apenas claro, escuro e sistema", () => {
    expect(normalizarModoTema("light")).toBe("light");
    expect(normalizarModoTema("dark")).toBe("dark");
    expect(normalizarModoTema("system")).toBe("system");
  });

  it("descarta o modo indefinido e valores desconhecidos", () => {
    expect(normalizarModoTema(undefined)).toBeUndefined();
    expect(normalizarModoTema(null)).toBeUndefined();
    expect(normalizarModoTema("")).toBeUndefined();
    expect(normalizarModoTema("claro")).toBeUndefined();
  });
});

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

  it("usa Menu, IconButton, next-themes e o modo do Material UI", () => {
    const fonte = ler("src/components/ui/mui/seletor-tema.tsx");
    expect(fonte).toContain('from "@mui/material/IconButton"');
    expect(fonte).toContain('from "@mui/material/Menu"');
    expect(fonte).toContain('from "@mui/material/MenuItem"');
    expect(fonte).toContain('from "next-themes"');
    expect(fonte).toContain("setTheme(valor)");
    expect(fonte).toContain("useColorScheme");
    expect(fonte).toContain("normalizarModoTema");
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

describe("SincronizarTema", () => {
  it("leva a preferência do next-themes ao modo de cor do MUI", () => {
    const fonte = ler("src/components/ui/mui/sincronizar-tema.tsx");
    expect(comCabecalho(fonte)).toBe(true);
    expect(fonte).toContain('from "next-themes"');
    expect(fonte).toContain("useColorScheme");
    expect(fonte).toContain("useEffect");
    expect(fonte).toContain("preferencia === mode");
    expect(fonte).toContain("setMode(preferencia)");
    expect(fonte).toContain("return null");
  });
});

describe("layout da raiz", () => {
  const layout = ler("src/app/layout.tsx");

  it("monta o provedor de avisos e a sincronização dentro do tema", () => {
    const inicioTema = layout.indexOf("<ThemeProvider");
    const fimTema = layout.indexOf("</ThemeProvider>");
    const sincronizar = layout.indexOf("<SincronizarTema />");
    const avisos = layout.indexOf("<ProvedorAvisos />");
    expect(inicioTema).toBeGreaterThan(-1);
    expect(fimTema).toBeGreaterThan(inicioTema);
    expect(sincronizar).toBeGreaterThan(inicioTema);
    expect(sincronizar).toBeLessThan(fimTema);
    expect(avisos).toBeGreaterThan(inicioTema);
    expect(avisos).toBeLessThan(fimTema);
  });

  it("preserva o Toaster do Sonner durante a coexistência", () => {
    expect(layout).toContain('from "@/components/ui/sonner"');
    expect(layout).toContain("<Toaster");
  });
});
