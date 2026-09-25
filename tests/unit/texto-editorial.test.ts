// Guarda editorial do repositório: nenhum travessão (em-dash ou
// meia-risca), reticências tipográficas, aspas curvas, setas ou
// pluralização com parênteses em código, documentação ou
// configuração. Convenção do projeto, verificada por teste.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

// Pastas e arquivos fora do escopo do repositório entregue.
const FORA_DO_ESCOPO = new Set([
  "node_modules",
  ".next",
  "generated",
  "analysis",
  ".postgres",
  ".postgres17",
  ".sandbox-tools",
  "sandbox",
  "tool-results",
  "skills",
  "download",
  ".git",
  "coverage",
]);

const ARQUIVOS_RAIZ = new Set([
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  ".env.example",
  "compose.yml",
  "Dockerfile",
]);

const EXTENSOES = new Set([
  ".ts",
  ".html",
  ".webmanifest",
  ".tsx",
  ".mjs",
  ".js",
  ".css",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".sql",
  ".prisma",
  ".example",
  ".sh",
]);

interface Regra {
  nome: string;
  regex: RegExp;
}

const REGRAS: Regra[] = [
  {
    nome: "travessão, meia-risca, reticências, aspas curvas, setas ou aspas angulares",
    regex: /[\u2026\u2014\u2013\u201C\u201D\u2018\u2019\u2192\u00AB\u00BB]/,
  },
  {
    nome: "entidades de aspas tipográficas",
    regex: /&ldquo;|&rdquo;|&lsquo;|&rsquo;|&mdash;|&ndash;/,
  },
  { nome: "segunda pessoa explícita", regex: /\bvocês?\b/i },
  {
    nome: "pluralização com parênteses",
    regex: /\b(?:aluno|professor|frequencia|turma|falta|presença|conta|sessão)\(s\)/i,
  },
];

async function listarArquivos(diretorio: string): Promise<string[]> {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const saida: string[] = [];
  for (const entrada of entradas) {
    if (FORA_DO_ESCOPO.has(entrada.name)) continue;
    const completo = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      saida.push(...(await listarArquivos(completo)));
    } else if (EXTENSOES.has(path.extname(entrada.name))) {
      saida.push(completo);
    }
  }
  return saida;
}

async function arquivosDoRepositorio(): Promise<string[]> {
  const raiz = await readdir(RAIZ, { withFileTypes: true });
  const alvos: string[] = [];
  for (const entrada of raiz) {
    if (FORA_DO_ESCOPO.has(entrada.name)) continue;
    const completo = path.join(RAIZ, entrada.name);
    if (entrada.isDirectory()) {
      if (["src", "docs", "scripts", "docker", "prisma", "tests"].includes(entrada.name)) {
        alvos.push(...(await listarArquivos(completo)));
      }
    } else if (
      ARQUIVOS_RAIZ.has(entrada.name) ||
      (EXTENSOES.has(path.extname(entrada.name)) && !entrada.name.endsWith(".log"))
    ) {
      alvos.push(completo);
    }
  }
  // O próprio teste referencia as entidades e escapes das regras como
  // texto, então fica fora da varredura.
  return alvos.filter((arquivo) => !arquivo.includes("texto-editorial.test.ts"));
}

describe("convenção editorial do repositório", () => {
  it("não contém travessões nem padrões proibidos", async () => {
    const arquivos = await arquivosDoRepositorio();
    expect(arquivos.length).toBeGreaterThan(10);
    const problemas: string[] = [];
    for (const arquivo of arquivos) {
      const conteudo = await readFile(arquivo, "utf8");
      const linhas = conteudo.split("\n");
      for (const regra of REGRAS) {
        linhas.forEach((linha, indice) => {
          if (regra.regex.test(linha)) {
            problemas.push(
              `${path.relative(RAIZ, arquivo)}:${indice + 1} [${regra.nome}] ${linha.trim().slice(0, 120)}`,
            );
          }
        });
      }
    }
    expect(problemas, `Padrões proibidos encontrados:\n${problemas.join("\n")}`).toEqual([]);
  });
});
