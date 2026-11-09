// Confere os contratos de rastreabilidade das ferramentas usadas nos workflows.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ferramentas reproduzíveis", () => {
  it.each(["valido", "vercel", "action", "terraform", "node", "imagem"])("confere consumidor real: %s", async (tipo) => {
    const inventario = JSON.parse(readFileSync("scripts/github/ferramentas.json", "utf8"));
    const nomes = new Set<string>([...readdirSync(".github/workflows").map((n) => `.github/workflows/${n}`), ...inventario.usos.map((u: { arquivo: string }) => u.arquivo), "package.json", "pnpm-lock.yaml"]);
    const arquivos = Object.fromEntries([...nomes].map((n) => [n, readFileSync(n, "utf8")]));
    const { conferirFerramentas } = await import("../../../scripts/github/conferir-ferramentas.mjs");
    if (tipo === "vercel") arquivos[".github/workflows/implantacao.yml"] += "\nrun: pnpm dlx vercel@latest\n";
    if (tipo === "action") arquivos[".github/workflows/implantacao.yml"] = (arquivos[".github/workflows/implantacao.yml"] ?? "").replace(/actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v7");
    if (tipo === "terraform") arquivos[".github/workflows/infra.yml"] = (arquivos[".github/workflows/infra.yml"] ?? "").replace('terraform_version: "1.17.1"', "terraform_version: latest");
    if (tipo === "node") arquivos[".github/workflows/implantacao.yml"] = (arquivos[".github/workflows/implantacao.yml"] ?? "").replace("node-version: 24.22.2", "node-version: 24");
    if (tipo === "imagem") arquivos["infra/servidor/validar.sh"] = (arquivos["infra/servidor/validar.sh"] ?? "").replace(/koalaman\/shellcheck:[^\s]+/, "koalaman/shellcheck:latest");
    if (tipo === "valido") expect(() => conferirFerramentas(arquivos, inventario)).not.toThrow();
    else expect(() => conferirFerramentas(arquivos, inventario)).toThrow();
  });
  it.each([
    ["Dockerfile.extra", "FROM node:latest AS base"],
    ["compose.extra.yml", "services:\n  qa:\n    image: node:fs"],
    [".github/workflows/extra.yml", "jobs:\n  qa:\n    container:\n      image: node:latest"],
    ["scripts/qa.sh", "docker run --rm -e QA=1 node:latest node -v"],
    ["scripts/qa.sh", "docker run --rm \\\n  -v /qa:/qa \\\n  node:fs"],
    ["scripts/qa.sh", "docker pull node:latest"],
    [".github/workflows/extra.yml", "driver-opts: image=moby/buildkit:latest"],
  ])("recusa referência de imagem no contexto %s: %s", async (nome, codigo) => {
    const inventario = JSON.parse(readFileSync("scripts/github/ferramentas.json", "utf8"));
    const nomes = new Set<string>([...readdirSync(".github/workflows").map((n) => `.github/workflows/${n}`), ...inventario.usos.map((u: { arquivo: string }) => u.arquivo), "package.json", "pnpm-lock.yaml"]);
    const arquivos = Object.fromEntries([...nomes].map((n) => [n, readFileSync(n, "utf8")]));
    arquivos[nome] = codigo;
    const { conferirFerramentas } = await import("../../../scripts/github/conferir-ferramentas.mjs");
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(`Imagem móvel ou divergente em ${nome}.`);
  });

  it.each(["digest", "action", "lock-vercel", "lock-playwright"])("recusa divergência causal: %s", async (tipo) => {
    const inventario = JSON.parse(readFileSync("scripts/github/ferramentas.json", "utf8"));
    const nomes = new Set<string>([...readdirSync(".github/workflows").map((n) => `.github/workflows/${n}`), ...inventario.usos.map((u: { arquivo: string }) => u.arquivo), "package.json", "pnpm-lock.yaml"]);
    const arquivos = Object.fromEntries([...nomes].map((n) => [n, readFileSync(n, "utf8")]));
    let erro: string;
    if (tipo === "digest") {
      arquivos["Dockerfile.extra"] = `FROM ${inventario.ferramentas.node.imagem.replace(/@sha256:.*/, "@sha256:" + "0".repeat(64))}`;
      erro = "Imagem móvel ou divergente em Dockerfile.extra.";
    } else if (tipo === "action") {
      arquivos[".github/workflows/extra.yml"] = "uses: actions/checkout@v7";
      erro = "Action não inventariada ou móvel em .github/workflows/extra.yml.";
    } else if (tipo === "lock-vercel") {
      arquivos["pnpm-lock.yaml"] = (arquivos["pnpm-lock.yaml"] ?? "").replaceAll(inventario.ferramentas.vercel.integridade, "sha512-invalida");
      erro = "Vercel divergente do lock.";
    } else {
      arquivos["pnpm-lock.yaml"] = (arquivos["pnpm-lock.yaml"] ?? "").replaceAll("playwright@1.64.1:", "playwright@0.0.0:");
      erro = "Playwright divergente do lock.";
    }
    const { conferirFerramentas } = await import("../../../scripts/github/conferir-ferramentas.mjs");
    expect(() => conferirFerramentas(arquivos, inventario)).toThrow(erro);
  });

  it("aceita módulos Node e ownership sem perder o alias de imagem com digest", async () => {
    const inventario = JSON.parse(readFileSync("scripts/github/ferramentas.json", "utf8"));
    const nomes = new Set<string>([...readdirSync(".github/workflows").map((n) => `.github/workflows/${n}`), ...inventario.usos.map((u: { arquivo: string }) => u.arquivo), "package.json", "pnpm-lock.yaml"]);
    const arquivos = Object.fromEntries([...nomes].map((n) => [n, readFileSync(n, "utf8")]));
    arquivos["scripts/qa.mjs"] = "import fs from 'node:fs';\nconst cp = await import('node:child_process');\nconst path = require('node:path');";
    arquivos["Dockerfile.extra"] = `FROM ${inventario.ferramentas.node.imagem.replace("24.22.2-", "24-")}\nRUN chown -R node:node /app`;
    const { conferirFerramentas } = await import("../../../scripts/github/conferir-ferramentas.mjs");
    expect(() => conferirFerramentas(arquivos, inventario)).not.toThrow();
  });

  it("executa as três etapas Vercel pela CLI instalada com lock congelado", () => {
    const codigo = readFileSync(".github/workflows/implantacao.yml", "utf8");
    const implantar = codigo.split("  implantar:")[1]?.split("  verificar:")[0] ?? "";
    const etapas = [...implantar.matchAll(/pnpm exec vercel (pull|build|deploy)\b/g)].map(
      (item) => item[1] ?? "",
    );
    expect(etapas).toEqual(["pull", "build", "deploy"]);
    expect(implantar).toContain("pnpm install --frozen-lockfile --ignore-scripts");
    expect(implantar).not.toContain("pnpm dlx");
    expect(implantar).not.toContain("@latest");
  });

  it("encadeia Helm, schemas locais e actionlint sem ignorar ferramentas ausentes", async () => {
    const { validarInfra } = await import("../../../scripts/github/validar-ferramentas-infra.mjs");
    const chamadas: { comando: string; args: string[]; entrada?: string }[] = [];
    await validarInfra(async (comando: string, args: string[], entrada?: string) => {
      chamadas.push({ comando, args, entrada });
      return comando === "helm" && args[0] === "template" ? "kind: ConfigMap\napiVersion: v1\n" : "";
    });
    expect(chamadas.map((c) => c.comando)).toEqual(["helm", "helm", "kubeconform", "actionlint"]);
    expect(chamadas[2]?.args).toContain("-strict");
    expect(chamadas[2]?.args.join(" ")).not.toContain("https:");
    expect(chamadas[2]?.entrada).toContain("kind: ConfigMap");
    await expect(validarInfra(async () => { throw new Error("Ferramenta indisponível"); })).rejects.toThrow("Ferramenta indisponível");
  });

  it("declara a CLI Vercel com versão exata para resolução pelo lock", () => {
    const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    expect(pacote.devDependencies?.vercel).toBe("65.12.1");
  });

  it("inclui os Dockerfiles de servidor fora da raiz no Dependabot", () => {
    const codigo = readFileSync(".github/dependabot.yml", "utf8");
    const docker = codigo.split("  - package-ecosystem: docker")[1] ?? "";
    const diretorios = [...docker.matchAll(/^\s+-\s+["']?(\/[^\s"']*)["']?\s*$/gm)].map(
      (item) => item[1] ?? "",
    );
    expect(diretorios).toEqual(["/", "/infra/servidor/nginx", "/infra/servidor/backup", "/tests/isolamento"]);
  });

  it("mantém propostas de atualizações maiores sem ignorá-las globalmente", () => {
    const codigo = readFileSync(".github/dependabot.yml", "utf8");
    expect(codigo).not.toMatch(
      /ignore:\s*\n\s*- dependency-name:\s*["']\*["']\s*\n\s*update-types:\s*\n\s*- version-update:semver-major/,
    );
  });

  it("define a versão exata do executável nos dois setups de Terraform", () => {
    const codigo = readFileSync(".github/workflows/infra.yml", "utf8");
    const configuracoes = [
      ...codigo.matchAll(
        /uses:\s*hashicorp\/setup-terraform@[^\n]+\n\s+with:\n\s+terraform_version:\s*([^\s#]+)/g,
      ),
    ].map((item) => (item[1] ?? "").replace(/["']/g, ""));
    expect(configuracoes).toEqual(["1.17.1", "1.17.1"]);
  });

  it("fixa as actions de infraestrutura em commits completos", () => {
    const codigo = readFileSync(".github/workflows/infra.yml", "utf8");
    const referencias = [...codigo.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map(
      (item) => item[1] ?? "",
    );
    expect(referencias.length).toBeGreaterThan(0);
    expect(referencias.filter((ref) => !/^[^@\s]+@[a-f0-9]{40}$/.test(ref))).toEqual([]);
  });
});
