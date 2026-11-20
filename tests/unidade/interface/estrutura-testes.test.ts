// Guardrail do contrato visual e da infraestrutura compartilhada dos testes.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function arquivos(diretorio: string, extensoes: string[]): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return arquivos(caminho, extensoes);
    return extensoes.some((extensao) => entrada.name.endsWith(extensao)) ? [caminho] : [];
  });
}

function ler(arquivo: string): string {
  return readFileSync(arquivo, "utf8");
}

function importa(texto: string, modulo: string): boolean {
  const escapado = modulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:from\\s*["']${escapado}["']|import\\s*\\(\\s*["']${escapado}["']\\s*\\)|import\\s*["']${escapado}["'])`,
  ).test(texto);
}

const PACOTES_PROIBIDOS = [
  "tailwindcss",
  "@tailwindcss/postcss",
  "tw-animate-css",
  "prettier-plugin-tailwindcss",
  "tailwind-merge",
  "class-variance-authority",
  "clsx",
  "lucide-react",
  "sonner",
  "next-themes",
  "motion",
  "motion/react",
  "@radix-ui/react-dialog",
  "@radix-ui/react-popover",
];

const CLASSES_TAILWIND =
  /^(?:flex|grid|hidden|block|inline|w-|h-|min-|max-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|gap-|text-|bg-|border(?:-|$)|rounded|shadow|items-|justify-|space-|size-|sr-only|absolute|relative|fixed|sticky|overflow-|z-|opacity-|font-|leading-|tracking-|animate-|transition|hover:|focus:|sm:|md:|lg:|xl:|dark:|data-\[|\[&)/;

describe("estrutura dos testes de interface", () => {
  it("não mantém CSS global nem CSS Modules no produto", () => {
    expect(arquivos("src", [".css"])).toEqual([]);
    expect(existsSync("src/app/globals.css")).toBe(false);
    expect(existsSync("src/app/superficies.css")).toBe(false);
    expect(existsSync("postcss.config.mjs")).toBe(false);
    expect(existsSync("components.json")).toBe(false);
    expect(existsSync("src/lib/utils.ts")).toBe(false);
  });

  it("remove o stack visual antigo das dependências", () => {
    const pacote = JSON.parse(ler("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const nomes = [
      ...Object.keys(pacote.dependencies ?? {}),
      ...Object.keys(pacote.devDependencies ?? {}),
    ];
    for (const proibido of PACOTES_PROIBIDOS) {
      expect(nomes, proibido).not.toContain(proibido);
    }
    expect(nomes.some((nome) => nome.startsWith("@radix-ui/"))).toBe(false);
  });

  it("não importa Tailwind, Radix, Lucide, Sonner, next-themes ou Motion", () => {
    for (const arquivo of arquivos("src", [".ts", ".tsx"])) {
      const texto = ler(arquivo);
      for (const proibido of PACOTES_PROIBIDOS) {
        expect(importa(texto, proibido), `${arquivo} importa ${proibido}`).toBe(false);
      }
      expect(texto, arquivo).not.toContain("@radix-ui/");
      expect(texto, arquivo).not.toContain("@/app/globals.css");
      expect(texto, arquivo).not.toContain("@/app/superficies.css");
      expect(texto, arquivo).not.toContain("@/lib/utils");
      for (const achado of texto.matchAll(/from\s*["'](@\/components\/ui\/[^"']+)["']/g)) {
        const caminho = achado[1] ?? "";
        const permitido = caminho.includes("/mui/") || caminho.endsWith("/seletor-periodo");
        expect(permitido, `${arquivo} importa ${caminho}`).toBe(true);
      }
    }
  });

  it("não importa o CSS nem o stack antigo nos testes", () => {
    for (const arquivo of arquivos("tests", [".ts", ".tsx"])) {
      const texto = ler(arquivo);
      for (const proibido of PACOTES_PROIBIDOS) {
        expect(importa(texto, proibido), `${arquivo} importa ${proibido}`).toBe(false);
      }
      for (const caminho of ["@/app/globals.css", "@/app/superficies.css", "@/lib/utils"]) {
        expect(importa(texto, caminho), `${arquivo} importa ${caminho}`).toBe(false);
      }
      for (const achado of texto.matchAll(/from\s*["']([^"']*components\/ui\/[^"']+)["']/g)) {
        const caminho = achado[1] ?? "";
        const permitido = caminho.includes("/mui/") || caminho.endsWith("/seletor-periodo");
        expect(permitido, `${arquivo} importa ${caminho}`).toBe(true);
      }
    }
  });

  it("mantém Recharts restrito ao FrequenciBI", () => {
    for (const arquivo of arquivos("src", [".ts", ".tsx"])) {
      const relativo = arquivo.replaceAll("\\", "/");
      if (relativo.startsWith("src/components/bi/")) continue;
      expect(importa(ler(arquivo), "recharts"), relativo).toBe(false);
    }
  });

  it("não usa classes utilitárias do Tailwind no produto", () => {
    for (const arquivo of arquivos("src", [".tsx"])) {
      const texto = ler(arquivo);
      for (const achado of texto.matchAll(/className=(?:"([^"]*)"|`([^`]*)`|\{"([^"]*)"\})/g)) {
        const classes = (achado[1] ?? achado[2] ?? achado[3] ?? "").split(/\s+/).filter(Boolean);
        for (const classe of classes) {
          expect(CLASSES_TAILWIND.test(classe), `${arquivo}: ${classe}`).toBe(false);
        }
      }
    }
  });

  it("mantém apenas as primitivas MUI em src/components/ui", () => {
    const entradas = readdirSync("src/components/ui", { withFileTypes: true }).map((entrada) =>
      entrada.isDirectory() ? `${entrada.name}/` : entrada.name,
    );
    expect(entradas.sort()).toEqual(["mui/", "seletor-periodo.tsx"]);
  });

  it("não usa os artefatos visuais removidos", () => {
    for (const arquivo of arquivos("tests", [".ts", ".tsx"])) {
      if (arquivo.endsWith("estrutura-testes.test.ts")) continue;
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toContain("controle-contornado");
      expect(texto, arquivo).not.toContain("paridade-campos");
      expect(texto, arquivo).not.toContain("outline-telas");
    }
  });

  it("não usa opacidade manual para desabilitar controles", () => {
    for (const arquivo of arquivos("src/components", [".tsx", ".css"])) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toMatch(
        /disabled:opacity-|peer-disabled:opacity-|group-data-\[disabled=true\]:opacity-/,
      );
    }
  });

  it("mantém a infraestrutura compartilhada dos testes de componente", () => {
    expect(() => readFileSync("tests/apoio/vite.ts", "utf8")).not.toThrow();
    expect(() => readFileSync("tests/apoio/navegador.ts", "utf8")).not.toThrow();
    expect(() =>
      readFileSync("tests/componentes/interface/primitivas.test.ts", "utf8"),
    ).not.toThrow();
  });
});
