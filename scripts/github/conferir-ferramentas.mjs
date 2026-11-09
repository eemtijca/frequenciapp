// Confere pins e consumidores; não provisiona recursos nem instala ferramentas.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

function referenciasDeImagem(codigo) {
  const referencias = [];
  const logico = codigo.replace(/\\\r?\n\s*/g, " ");
  // FROM, campos de imagem e opções de driver são referências, não módulos ou ownership.
  for (const [, ref] of logico.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?["']?([^\s"']+)/gim)) referencias.push(ref);
  for (const [, ref] of logico.matchAll(/\bimage\s*[:=]\s*["']?([^\s"'<>),;]+)/g)) referencias.push(ref);
  const comValor = new Set(["-e", "--env", "--env-file", "-v", "--volume", "-w", "--workdir", "-u", "--user", "--name", "--network", "--add-host", "--entrypoint", "--platform", "--mount", "--label", "--pull"]);
  const semValor = new Set(["--rm", "-i", "-t", "-it", "-d", "--detach", "--init", "--read-only", "--all-tags", "-a", "--quiet", "-q"]);
  for (const [, argumentos] of logico.matchAll(/\bdocker\s+(?:run|create|pull)\s+([^\n]+)/g)) {
    const tokens = argumentos.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].replace(/^["']|["']$/g, "");
      if (token === "--") continue;
      if (comValor.has(token)) { i++; continue; }
      if (semValor.has(token) || /^--[^=]+=/.test(token) || /^-[evwu].+/.test(token)) continue;
      if (token.startsWith("-")) throw new Error("Opção Docker exige classificação na guarda de ferramentas.");
      referencias.push(token);
      break;
    }
  }
  return referencias;
}

export function conferirFerramentas(arquivos, inventario) {
  const { ferramentas, usos, actions } = inventario;
  for (const [nome, codigo] of Object.entries(arquivos)) {
    if (/pnpm\s+dlx\s+vercel|vercel@latest/.test(codigo)) throw new Error(`Vercel fora do lock em ${nome}.`);
    for (const ferramenta of Object.values(ferramentas)) {
      if (!ferramenta.imagem) continue;
      const origem = ferramenta.imagem.split(":")[0];
      for (const ref of referenciasDeImagem(codigo)) {
        if (ref !== origem && !ref.startsWith(`${origem}:`) && !ref.startsWith(`${origem}@`)) continue;
        const aliasNode = ferramenta === ferramentas.node && ref === ferramenta.imagem.replace("24.22.2-", "24-");
        if (ref !== ferramenta.imagem && !aliasNode) throw new Error(`Imagem móvel ou divergente em ${nome}.`);
      }
    }
    if (nome.startsWith(".github/workflows/")) {
      for (const [, ref] of codigo.matchAll(/\buses:\s*([^\s#]+)/g)) {
        if (ref.startsWith("./")) continue;
        if (!/^[^@]+@[0-9a-f]{40}$/.test(ref) || !actions.includes(ref)) throw new Error(`Action não inventariada ou móvel em ${nome}.`);
      }
      for (const [, versao] of codigo.matchAll(/node-version:\s*["']?([^\s"']+)/g)) {
        if (versao !== ferramentas.node.versao) throw new Error(`Node móvel em ${nome}.`);
      }
      for (const [, versao] of codigo.matchAll(/terraform_version:\s*["']?([^\s"']+)/g)) {
        if (versao !== ferramentas.terraform.versao) throw new Error(`Terraform móvel em ${nome}.`);
      }
    }
  }
  for (const uso of usos) {
    if (!arquivos[uso.arquivo]?.includes(uso.trecho)) throw new Error(`Consumidor divergente: ${uso.arquivo}, ${uso.ferramenta}.`);
  }
  const pacote = JSON.parse(arquivos["package.json"]);
  if (pacote.devDependencies.vercel !== ferramentas.vercel.versao ||
      !arquivos["pnpm-lock.yaml"].includes(ferramentas.vercel.integridade)) throw new Error("Vercel divergente do lock.");
  const playwright = ferramentas.playwright.versao.replace(/-noble$/, "");
  if (!arquivos["pnpm-lock.yaml"].includes(`playwright@${playwright}:`)) throw new Error("Playwright divergente do lock.");
  for (const ferramenta of Object.values(ferramentas)) {
    if (ferramenta.imagem && !/:[^@\s]+@sha256:[0-9a-f]{64}$/.test(ferramenta.imagem)) throw new Error("Imagem de ferramenta sem digest.");
  }
}

export function conferirVersaoTerraform(saida, inventario) {
  if (JSON.parse(saida).terraform_version !== inventario.ferramentas.terraform.versao) throw new Error("Terraform instalado diverge do inventário.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inventario = JSON.parse(readFileSync(new URL("./ferramentas.json", import.meta.url), "utf8"));
    if (process.argv[2] === "--terraform") {
      conferirVersaoTerraform(execFileSync("terraform", ["version", "-json"], { encoding: "utf8" }), inventario);
    } else {
      const nomes = new Set([...readdirSync(".github/workflows").map((n) => `.github/workflows/${n}`), ...inventario.usos.map((u) => u.arquivo), "package.json", "pnpm-lock.yaml"]);
      conferirFerramentas(Object.fromEntries([...nomes].map((n) => [n, readFileSync(n, "utf8")])), inventario);
    }
  } catch (erro) { console.error(erro.message); process.exitCode = 1; }
}
