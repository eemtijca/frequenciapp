// Confere o inventário de ferramentas, os pins do Node e a classificação do esbuild.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// @ts-expect-error: os scanners são JavaScript sem declaração de tipos e ficam fora do tsconfig.
import * as moduloScanner from "../../../scripts/github/conferir-ferramentas.mjs";

type Scanner = {
  conferirFerramentas: (arquivos: Record<string, string>, inventario: Inventario) => void;
  lerAllowBuilds: (codigo: string) => Record<string, boolean>;
  montarArquivos: (inventario: Inventario) => Record<string, string>;
};

const { conferirFerramentas, lerAllowBuilds, montarArquivos } = moduloScanner as Scanner;

type Inventario = {
  ferramentas: {
    node: { versao: string; serie: string; imagem: string };
    corepack: { versao: string };
    pnpm: { versao: string };
  };
  builds: Record<string, { permitido: boolean; motivo: string }>;
  actions: Array<{ referencia: string; versao: string }>;
  pendencias: Array<{ tipo: string; arquivo: string; referencia: string; motivo: string }>;
  usos: Array<{ arquivo: string; trecho: string; estado: string }>;
  dependabot: { diretoriosDocker: string[] };
};

function lerInventario(): Inventario {
  return JSON.parse(readFileSync("scripts/github/ferramentas.json", "utf8")) as Inventario;
}

function clonar(inventario: Inventario): Inventario {
  return JSON.parse(JSON.stringify(inventario)) as Inventario;
}

function exigirArquivo(arquivos: Record<string, string>, nome: string): string {
  const codigo = arquivos[nome];
  if (codigo === undefined) throw new Error(`Arquivo ausente no teste: ${nome}.`);
  return codigo;
}

describe("inventário de ferramentas", () => {
  it("aceita o inventário e os consumidores reais", () => {
    const inventario = lerInventario();
    expect(() => conferirFerramentas(montarArquivos(inventario), inventario)).not.toThrow();
  });

  it("executa o scanner pela linha de comando", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/github/conferir-ferramentas.mjs"], {
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("recusa imagem móvel no Dockerfile", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    arquivos.Dockerfile = exigirArquivo(arquivos, "Dockerfile").replace(
      inventario.ferramentas.node.imagem,
      "node:26-bookworm-slim",
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(
      "Imagem móvel ou fora do inventário no Dockerfile",
    );
  });

  it("recusa action móvel em workflow", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    const nome = ".github/workflows/qualidade.yml";
    arquivos[nome] = exigirArquivo(arquivos, nome).replace(
      /actions\/checkout@[a-f0-9]{40}/,
      "actions/checkout@v7",
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(
      "Action móvel ou fora do inventário",
    );
  });

  it("recusa action com SHA fora do inventário", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    const nome = ".github/workflows/qualidade.yml";
    arquivos[nome] = exigirArquivo(arquivos, nome).replace(
      /actions\/checkout@[a-f0-9]{40}/,
      `actions/checkout@${"f".repeat(40)}`,
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow("Action fora do inventário");
  });

  it("recusa pendência de action resolvida sem atualizar o inventário", () => {
    const inventario = lerInventario();
    inventario.pendencias.push({
      tipo: "action",
      arquivo: ".github/workflows/infra.yml",
      referencia: "actions/cache@v4",
      motivo: "teste sintético de pendência resolvida",
    });
    const pendencia = inventario.pendencias.find((item) => item.referencia === "actions/cache@v4");
    if (!pendencia) throw new Error("Inventário sem a pendência esperada do actions/cache.");
    const arquivos = montarArquivos(inventario);
    const checkout = inventario.actions.find((action) =>
      action.referencia.startsWith("actions/checkout@"),
    );
    if (!checkout) throw new Error("Inventário sem action de checkout.");
    arquivos[pendencia.arquivo] = exigirArquivo(arquivos, pendencia.arquivo).replaceAll(
      pendencia.referencia,
      checkout.referencia,
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(
      "Pendência resolvida ou alterada",
    );
  });

  it("recusa imagem pinada no inventário sem digest", () => {
    const inventario = clonar(lerInventario());
    inventario.ferramentas.node.imagem = "node:26.13.0-bookworm-slim";
    expect(() => conferirFerramentas(montarArquivos(lerInventario()), inventario)).toThrow(
      "Imagem do Node sem tag e digest",
    );
  });

  it("recusa action pinada no inventário sem SHA completo", () => {
    const inventario = clonar(lerInventario());
    const action = inventario.actions[0];
    if (!action) throw new Error("Inventário sem actions.");
    action.referencia = "actions/checkout@v7";
    expect(() => conferirFerramentas(montarArquivos(lerInventario()), inventario)).toThrow(
      "Action sem SHA completo no inventário",
    );
  });

  it("cobre todas as actions usadas nos workflows", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    const referencias = new Set<string>();
    for (const [nome, codigo] of Object.entries(arquivos)) {
      if (!nome.startsWith(".github/workflows/")) continue;
      for (const item of codigo.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
        const referencia = item[1] ?? "";
        if (!referencia.startsWith("./")) referencias.add(referencia);
      }
    }
    const cobertas = new Set([
      ...inventario.actions.map((action) => action.referencia),
      ...inventario.pendencias
        .filter((item) => item.tipo === "action")
        .map((item) => item.referencia),
    ]);
    expect([...referencias].filter((referencia) => !cobertas.has(referencia))).toEqual([]);
  });
});

describe("classificação dos scripts de instalação", () => {
  it("permite o postinstall do esbuild no pnpm-workspace", () => {
    const builds = lerAllowBuilds(readFileSync("pnpm-workspace.yaml", "utf8"));
    const inventario = lerInventario();
    expect(builds.esbuild).toBe(true);
    expect(inventario.builds.esbuild?.permitido).toBe(true);
  });

  it("recusa allowBuilds sem classificação para o esbuild", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    arquivos["pnpm-workspace.yaml"] = exigirArquivo(arquivos, "pnpm-workspace.yaml").replace(
      /^\s+esbuild: true\r?\n/m,
      "",
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(
      "allowBuilds não classifica esbuild",
    );
  });

  it("recusa allowBuilds que nega o binário do esbuild", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    arquivos["pnpm-workspace.yaml"] = exigirArquivo(arquivos, "pnpm-workspace.yaml").replace(
      /^(\s+esbuild:\s*)true/m,
      "$1false",
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(
      "allowBuilds diverge do inventário em esbuild",
    );
  });
});

describe("pins do Node, pnpm e Dependabot", () => {
  it("mantém o Node do Dockerfile na versão e na série do CI", () => {
    const inventario = lerInventario();
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(inventario.ferramentas.node.serie).toBe("26");
    expect(dockerfile).toContain(inventario.ferramentas.node.imagem);
    expect(dockerfile).not.toContain("FROM node:26-bookworm-slim");
  });

  it("instala Corepack pinado antes de habilitar o pnpm no Node 26", () => {
    const inventario = lerInventario();
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("RUN npm install --global corepack@0.36.0 && corepack enable");
    expect(inventario.ferramentas.corepack.versao).toBe("0.36.0");
  });

  it("recusa o Dockerfile sem o bootstrap do Corepack", () => {
    const inventario = lerInventario();
    const arquivos = montarArquivos(inventario);
    arquivos.Dockerfile = exigirArquivo(arquivos, "Dockerfile").replace(
      "RUN npm install --global corepack@0.36.0 && corepack enable",
      "RUN corepack enable",
    );
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow("Consumidor divergente");
  });

  it.each(["corepack@latest", "corepack@0.35.0"])(
    "recusa bootstrap do Corepack fora do pin: %s",
    (referencia) => {
      const inventario = lerInventario();
      const arquivos = montarArquivos(inventario);
      arquivos.Dockerfile = exigirArquivo(arquivos, "Dockerfile").replace(
        "corepack@0.36.0",
        referencia,
      );
      expect(() => conferirFerramentas(arquivos, inventario)).toThrow("Consumidor divergente");
    },
  );

  it("alinha o pnpm com o packageManager", () => {
    const inventario = lerInventario();
    const pacote = JSON.parse(readFileSync("package.json", "utf8")) as { packageManager?: string };
    expect(pacote.packageManager).toBe(`pnpm@${inventario.ferramentas.pnpm.versao}`);
  });

  it("cobre os diretórios Docker existentes no Dependabot", () => {
    const inventario = lerInventario();
    const codigo = readFileSync(".github/dependabot.yml", "utf8");
    const bloco =
      codigo.split("- package-ecosystem: docker")[1]?.split("- package-ecosystem:")[0] ?? "";
    const diretorios = [...bloco.matchAll(/^\s*-\s*(\/[^\s]*)\s*$/gm)].map((item) => item[1] ?? "");
    expect(diretorios).toEqual(inventario.dependabot.diretoriosDocker);
  });

  it("não ignora atualizações de versão maior em todo o ecossistema", () => {
    const codigo = readFileSync(".github/dependabot.yml", "utf8");
    expect(codigo).not.toMatch(
      /ignore:\s*\r?\n\s*-\s*dependency-name:\s*["']?\*["']?\s*\r?\n\s*update-types:\s*\r?\n\s*-\s*version-update:semver-major/,
    );
  });
});
