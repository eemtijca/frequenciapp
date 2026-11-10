// Confere pins e consumidores das ferramentas sem baixar imagens nem provisionar recursos.
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA_DE_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;
const IMAGEM_COM_DIGEST = /^[^@\s]+:[^@\s]+@sha256:[0-9a-f]{64}$/;
const ESTAGIO_LOCAL = /^(?:base|dependencias|compilacao|producao|execucao)$/;

export function lerAllowBuilds(codigo) {
  const linhas = codigo.split(/\r?\n/);
  const inicio = linhas.findIndex((linha) => /^allowBuilds:\s*$/.test(linha));
  if (inicio < 0) throw new Error("pnpm-workspace.yaml sem allowBuilds.");
  const mapa = {};
  for (let i = inicio + 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? "";
    if (linha.trim() === "" || linha.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(linha)) break;
    const item = /^\s+["']?([^"':#]+?)["']?:\s*(true|false)\s*(?:#.*)?$/.exec(linha);
    if (!item) throw new Error(`Linha inválida em allowBuilds: ${linha.trim()}.`);
    const nome = item[1] ?? "";
    if (nome in mapa) throw new Error(`allowBuilds repete ${nome}.`);
    mapa[nome] = item[2] === "true";
  }
  return mapa;
}

function imagensDoDockerfile(codigo) {
  const imagens = [];
  for (const [, instrucao] of codigo.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(.+)$/gim)) {
    const referencia =
      instrucao
        .trim()
        .split(/\s+/)[0]
        ?.replace(/^["']|["']$/g, "") ?? "";
    if (!referencia || referencia.includes("$")) continue;
    if (ESTAGIO_LOCAL.test(referencia)) continue;
    imagens.push(referencia);
  }
  return imagens;
}

function referenciasDeActions(codigo) {
  return [...codigo.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((item) => item[1] ?? "");
}

function versoesDeNode(codigo) {
  return [...codigo.matchAll(/\bnode-version:\s*["']?([^\s"']+)/g)].map((item) => item[1] ?? "");
}

function blocoDependabot(codigo, ecossistema) {
  const linhas = codigo.split(/\r?\n/);
  const inicio = linhas.findIndex((linha) =>
    new RegExp(`^\\s*-\\s*package-ecosystem:\\s*${ecossistema}\\s*$`).test(linha),
  );
  if (inicio < 0) return "";
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (/^\s*-\s*package-ecosystem:/.test(linhas[i] ?? "")) {
      fim = i;
      break;
    }
  }
  return linhas.slice(inicio, fim).join("\n");
}

function diretoriosDocker(codigo) {
  return [
    ...blocoDependabot(codigo, "docker").matchAll(/^\s*-\s*["']?(\/[^\s"']*)["']?\s*$/gm),
  ].map((item) => item[1] ?? "");
}

function ignoraMajorGlobal(codigo) {
  return /ignore:\s*\r?\n\s*-\s*dependency-name:\s*["']?\*["']?\s*\r?\n\s*update-types:\s*\r?\n\s*-\s*version-update:semver-major/.test(
    codigo,
  );
}

export function montarArquivos(inventario) {
  const nomes = new Set([
    "Dockerfile",
    ".github/dependabot.yml",
    "package.json",
    "pnpm-workspace.yaml",
    ...[...inventario.usos, ...inventario.pendencias].map((item) => item.arquivo),
    ...readdirSync(".github/workflows")
      .filter((nome) => /\.ya?ml$/.test(nome))
      .map((nome) => `.github/workflows/${nome}`),
  ]);
  return Object.fromEntries([...nomes].map((nome) => [nome, readFileSync(nome, "utf8")]));
}

export function conferirFerramentas(arquivos, inventario) {
  const {
    ferramentas,
    builds = {},
    actions = [],
    pendencias = [],
    usos = [],
    dependabot,
  } = inventario;
  if (!ferramentas?.node || !ferramentas?.pnpm) throw new Error("Inventário sem Node ou pnpm.");
  if (!IMAGEM_COM_DIGEST.test(ferramentas.node.imagem)) {
    throw new Error("Imagem do Node sem tag e digest.");
  }

  const actionsPinadas = new Set();
  for (const action of actions) {
    if (!SHA_DE_ACTION.test(action.referencia)) {
      throw new Error(`Action sem SHA completo no inventário: ${action.referencia}.`);
    }
    if (actionsPinadas.has(action.referencia)) {
      throw new Error(`Action repetida no inventário: ${action.referencia}.`);
    }
    actionsPinadas.add(action.referencia);
  }

  const pacote = JSON.parse(arquivos["package.json"] ?? "{}");
  if (pacote.packageManager !== `pnpm@${ferramentas.pnpm.versao}`) {
    throw new Error("pnpm do packageManager diverge do inventário.");
  }

  const permitidos = lerAllowBuilds(arquivos["pnpm-workspace.yaml"] ?? "");
  for (const [nome, config] of Object.entries(builds)) {
    if (!(nome in permitidos)) throw new Error(`allowBuilds não classifica ${nome}.`);
    if (permitidos[nome] !== config.permitido) {
      throw new Error(`allowBuilds diverge do inventário em ${nome}.`);
    }
  }
  for (const nome of Object.keys(permitidos)) {
    if (!(nome in builds)) throw new Error(`allowBuilds tem entrada fora do inventário: ${nome}.`);
  }
  if (permitidos.esbuild !== true)
    throw new Error("esbuild precisa do postinstall para usar o binário.");

  const imagens = imagensDoDockerfile(arquivos["Dockerfile"] ?? "");
  if (!imagens.includes(ferramentas.node.imagem)) {
    throw new Error("Dockerfile não usa a imagem exata do Node.");
  }
  for (const imagem of imagens) {
    if (imagem !== ferramentas.node.imagem) {
      throw new Error(`Imagem móvel ou fora do inventário no Dockerfile: ${imagem}.`);
    }
  }

  const pendenciasDeAction = pendencias.filter((item) => item.tipo === "action");
  for (const [nome, codigo] of Object.entries(arquivos)) {
    if (!nome.startsWith(".github/workflows/")) continue;
    for (const referencia of referenciasDeActions(codigo)) {
      if (referencia.startsWith("./") || actionsPinadas.has(referencia)) continue;
      if (
        pendenciasDeAction.some((item) => item.arquivo === nome && item.referencia === referencia)
      ) {
        continue;
      }
      if (!SHA_DE_ACTION.test(referencia)) {
        throw new Error(`Action móvel ou fora do inventário em ${nome}: ${referencia}.`);
      }
      throw new Error(`Action fora do inventário em ${nome}: ${referencia}.`);
    }
    for (const versao of versoesDeNode(codigo)) {
      if (versao !== ferramentas.node.serie && versao !== ferramentas.node.versao) {
        throw new Error(`Node fora da série suportada em ${nome}: ${versao}.`);
      }
    }
  }

  for (const pendencia of pendencias) {
    const codigo = arquivos[pendencia.arquivo];
    if (codigo === undefined)
      throw new Error(`Arquivo da pendência ausente: ${pendencia.arquivo}.`);
    if (!codigo.includes(pendencia.referencia)) {
      throw new Error(
        `Pendência resolvida ou alterada em ${pendencia.arquivo}: ${pendencia.referencia}. Atualize o inventário.`,
      );
    }
    if (pendencia.tipo === "imagem" && IMAGEM_COM_DIGEST.test(pendencia.referencia)) {
      throw new Error(
        `Pendência de imagem já pinada em ${pendencia.arquivo}: ${pendencia.referencia}.`,
      );
    }
  }

  for (const uso of usos) {
    if (!arquivos[uso.arquivo]?.includes(uso.trecho)) {
      throw new Error(`Consumidor divergente: ${uso.arquivo}, ${uso.trecho}.`);
    }
  }

  const dependabotCodigo = arquivos[".github/dependabot.yml"] ?? "";
  if (
    JSON.stringify(diretoriosDocker(dependabotCodigo)) !==
    JSON.stringify(dependabot.diretoriosDocker)
  ) {
    throw new Error("Dependabot não cobre os diretórios Docker do inventário.");
  }
  if (ignoraMajorGlobal(dependabotCodigo)) {
    throw new Error("Dependabot ignora atualizações de versão maior em todo o ecossistema.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inventario = JSON.parse(
      readFileSync(new URL("./ferramentas.json", import.meta.url), "utf8"),
    );
    conferirFerramentas(montarArquivos(inventario), inventario);
    console.log("Ferramentas conferidas.");
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
