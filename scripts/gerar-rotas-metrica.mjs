// Gera o registro estático das rotas da API usado no label de métricas HTTP.
// Uso: pnpm run rotas:gerar. Com --verificar, somente compara com o arquivo versionado.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.join(RAIZ, "src/app/api");
const DESTINO = path.join(RAIZ, "src/infra/metricas-rotas.ts");

const SEGMENTO_DINAMICO = /^\[(\.\.\.)?([^\]]+)\]$/;
const SEGMENTO_OPCIONAL = /^\[\[(?:\.\.\.)?([^\]]+)\]\]$/;

/** Escapa o segmento estático para uso literal dentro de uma expressão regular. */
function escaparRegex(segmento) {
  return segmento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("/", "\\/");
}

/** Lista os arquivos `route.ts` sob um diretório, em ordem estável. */
async function listarArquivos(diretorio) {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const arquivos = [];
  const ordenadas = entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entrada of ordenadas) {
    const completo = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) arquivos.push(...(await listarArquivos(completo)));
    else if (entrada.isFile() && entrada.name === "route.ts") arquivos.push(completo);
  }
  return arquivos;
}

/** Converte o caminho relativo de uma rota em rótulo e expressão ancorada. */
function descrever(segmentos) {
  const rotulo = ["api"];
  const regex = ["api"];
  let estatica = true;
  for (const segmento of segmentos) {
    const opcional = SEGMENTO_OPCIONAL.exec(segmento);
    if (opcional) {
      estatica = false;
      rotulo.push(`:${opcional[1]}`);
      regex.push("(?:[^\\/]+(?:\\/[^\\/]+)*)?");
      continue;
    }
    const dinamico = SEGMENTO_DINAMICO.exec(segmento);
    if (dinamico) {
      estatica = false;
      rotulo.push(`:${dinamico[2]}`);
      regex.push(dinamico[1] ? "[^\\/]+(?:\\/[^\\/]+)*" : "[^\\/]+");
      continue;
    }
    if (segmento.includes("[") || segmento.includes("]")) {
      throw new Error(`Segmento de rota não reconhecido: ${segmento}`);
    }
    rotulo.push(segmento);
    regex.push(escaparRegex(segmento));
  }
  return {
    rotulo: `/${rotulo.join("/")}`,
    padrao: `/^\\/${regex.join("\\/")}$/`,
    segmentos: rotulo.length,
    estatica,
  };
}

/** Ordena estáticas antes das dinâmicas, mais longas antes das curtas e, por fim, pelo rótulo. */
function comparar(a, b) {
  if (a.estatica !== b.estatica) return a.estatica ? -1 : 1;
  if (a.segmentos !== b.segmentos) return b.segmentos - a.segmentos;
  if (a.rotulo < b.rotulo) return -1;
  if (a.rotulo > b.rotulo) return 1;
  return 0;
}

/** Monta as rotas em memória, sem tocar no arquivo versionado. */
export async function listarRotas({ diretorioApi = API } = {}) {
  const arquivos = await listarArquivos(diretorioApi);
  const rotas = arquivos.map((arquivo) => {
    const relativo = path.relative(diretorioApi, path.dirname(arquivo));
    const segmentos = relativo === "" ? [] : relativo.split(path.sep);
    return descrever(segmentos);
  });
  return rotas.sort(comparar);
}

/** Monta o conteúdo determinístico do arquivo gerado. */
export async function gerarConteudo({ diretorioApi = API } = {}) {
  const rotas = await listarRotas({ diretorioApi });
  const linhas = rotas.flatMap((rota) => {
    return [
      "  {",
      `    padrao: ${rota.padrao},`,
      `    rotulo: ${JSON.stringify(rota.rotulo)},`,
      "  },",
    ];
  });
  return [
    "// Registro estático das rotas da API usado no label de rota das métricas HTTP.",
    "// Arquivo gerado por `pnpm run rotas:gerar`; não edite à mão.",
    "",
    "export interface RotaDeMetrica {",
    "  readonly padrao: RegExp;",
    "  readonly rotulo: string;",
    "}",
    "",
    "export const ROTAS_DE_METRICA: readonly RotaDeMetrica[] = Object.freeze([",
    ...linhas,
    "]);",
    "",
  ].join("\n");
}

/** Regrava o arquivo versionado e informa a quantidade de rotas. */
export async function gerarArquivo({ destino = DESTINO, diretorioApi = API } = {}) {
  const conteudo = await gerarConteudo({ diretorioApi });
  await writeFile(destino, conteudo);
  const rotas = await listarRotas({ diretorioApi });
  return { destino, total: rotas.length };
}

/** Confere se o arquivo versionado corresponde ao que o gerador produz hoje. */
export async function verificarArquivo({ destino = DESTINO, diretorioApi = API } = {}) {
  const esperado = await gerarConteudo({ diretorioApi });
  const rotas = await listarRotas({ diretorioApi });
  let atual;
  try {
    atual = await readFile(destino, "utf8");
  } catch {
    return { atualizado: false, total: rotas.length, motivo: "arquivo ausente" };
  }
  if (atual === esperado) return { atualizado: true, total: rotas.length, motivo: "" };
  return { atualizado: false, total: rotas.length, motivo: "conteúdo divergente" };
}

async function principal() {
  const argumentos = process.argv.slice(2);
  if (argumentos.includes("--verificar")) {
    const resultado = await verificarArquivo();
    if (!resultado.atualizado) {
      console.error(
        `src/infra/metricas-rotas.ts está desatualizado (${resultado.motivo}). Rode pnpm run rotas:gerar.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Registro de rotas confere: ${resultado.total} rotas.`);
    return;
  }
  if (argumentos.length > 0) {
    console.error("Uso: node scripts/gerar-rotas-metrica.mjs [--verificar]");
    process.exitCode = 2;
    return;
  }
  const resultado = await gerarArquivo();
  console.log(`Gerado src/infra/metricas-rotas.ts com ${resultado.total} rotas.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await principal();
}
