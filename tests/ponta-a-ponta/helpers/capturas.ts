// Infraestrutura das capturas da galeria: destino, esperas, conferências e manifesto.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { aguardarHidratacao } from "./pagina";

export type TemaCaptura = "claro" | "escuro";
export type NomeViewport = "desktop" | "mobile";

export interface ViewportCaptura {
  nome: NomeViewport;
  largura: number;
  altura: number;
}

export interface CapturaManifesto {
  /** Nome do arquivo dentro de docs/imagens, sempre com extensão .png. */
  nome: string;
  /** Área da galeria, por exemplo Painel ou Gestão. */
  area: string;
  viewport: ViewportCaptura;
  tema: TemaCaptura;
  /** Rota aberta antes da preparação da tela. */
  rota: string;
}

export interface Captura extends CapturaManifesto {
  /** Ajusta a tela para o estado capturado com papéis e rótulos acessíveis. */
  preparar?: (page: Page) => Promise<void>;
}

export interface ManifestoGaleria {
  versao: number;
  capturas: CapturaManifesto[];
}

const RAIZ = process.cwd();
const PASTA_FINAL = path.join(RAIZ, "docs/imagens");
const PASTA_LOCAL = path.join(PASTA_FINAL, "locais");
const MANIFESTO = path.join(PASTA_FINAL, "galeria.json");
const VERSAO_MANIFESTO = 1;

const SELETORES_GRAFICO = [
  'svg[role="img"]',
  '[role="img"] svg',
  "figure svg",
  ".recharts-wrapper svg",
  ".MuiChartsSurface-root",
];

/** Escolhe o destino pelo ambiente: versão final ou validação local ignorada pelo Git. */
export function pastaDeCapturas(): string {
  const final = process.env.CAPTURAS === "1";
  const local = process.env.CAPTURAS_LOCAIS === "1";
  if (final && local) {
    throw new Error("Defina CAPTURAS ou CAPTURAS_LOCAIS, nunca os dois ao mesmo tempo.");
  }
  if (final) return PASTA_FINAL;
  if (local) return PASTA_LOCAL;
  throw new Error("Defina CAPTURAS=1 para a galeria ou CAPTURAS_LOCAIS=1 para capturas locais.");
}

/** Reinicia o manifesto versionado antes de uma execução completa da galeria. */
export async function iniciarGaleria(): Promise<void> {
  if (pastaDeCapturas() !== PASTA_FINAL) return;
  await mkdir(PASTA_FINAL, { recursive: true });
  await escreverManifesto({ versao: VERSAO_MANIFESTO, capturas: [] });
}

/** Remove o foco da última ação para a captura mostrar apenas o estado da tela. */
export async function limparFoco(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/**
 * Aplica a preferência de cor e espera o esquema resolvido no atributo do MUI.
 */
export async function aguardarTema(page: Page, tema: TemaCaptura): Promise<void> {
  await page.emulateMedia({ colorScheme: tema === "claro" ? "light" : "dark" });
  try {
    await page.waitForFunction((esperado) => {
      const raiz = document.documentElement;
      const atribuido = raiz.getAttribute("data-mui-color-scheme");
      const sistema = matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
      if (atribuido === "light" || atribuido === "dark") {
        return atribuido === (esperado === "claro" ? "light" : "dark");
      }
      if (atribuido === "system") return sistema === esperado;
      return sistema === esperado;
    }, tema);
  } catch (erro) {
    throw new Error(`O tema ${tema} não foi aplicado em ${page.url()}.`, { cause: erro });
  }
}

/** Espera o carregamento das fontes para evitar troca de métricas na captura. */
export async function aguardarFontes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

/** Reprova a captura quando o documento inteiro rola na horizontal. */
export async function conferirSemRolagemHorizontal(page: Page): Promise<void> {
  const excesso = await page.evaluate(() => {
    const raiz = document.documentElement;
    return Math.max(0, raiz.scrollWidth - raiz.clientWidth);
  });
  expect(excesso, `Rolagem horizontal de ${excesso} px em ${page.url()}`).toBeLessThanOrEqual(1);
}

/**
 * Confere os gráficos visíveis: cada svg precisa de dimensões maiores que zero.
 * O mínimo permite exigir pelo menos um gráfico nas telas que os possuem.
 */
export async function conferirGraficos(page: Page, opcoes?: { minimo?: number }): Promise<void> {
  const minimo = opcoes?.minimo ?? 0;
  const seletores = SELETORES_GRAFICO.join(", ");
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ lista, quantidade }) => {
            const svgs = [...document.querySelectorAll(lista)].filter((svg) => {
              const estilo = getComputedStyle(svg);
              return svg.getClientRects().length > 0 && estilo.visibility !== "hidden";
            });
            const semTamanho = svgs.filter((svg) => {
              const caixa = svg.getBoundingClientRect();
              return caixa.width <= 0 || caixa.height <= 0;
            }).length;
            return semTamanho === 0 && svgs.length >= quantidade;
          },
          { lista: seletores, quantidade: minimo },
        ),
      { timeout: 10_000, message: `Gráfico sem dimensões em ${page.url()}` },
    )
    .toBe(true);
}

/** Indica se a página tem scripts do Next e, portanto, precisa esperar a hidratação. */
async function paginaHidratavel(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.querySelector('script[src*="/_next/"]')));
}

/** Abre a rota, prepara o estado, confere a tela e grava a captura com o manifesto. */
export async function capturarTela(page: Page, captura: Captura): Promise<string> {
  const pasta = pastaDeCapturas();
  await mkdir(pasta, { recursive: true });
  await page.setViewportSize({
    width: captura.viewport.largura,
    height: captura.viewport.altura,
  });
  if (new URL(page.url()).pathname !== captura.rota) await page.goto(captura.rota);
  if (await paginaHidratavel(page)) await aguardarHidratacao(page, "button, main a, nav a");
  await aguardarTema(page, captura.tema);
  if (captura.preparar) await captura.preparar(page);
  await aguardarFontes(page);
  await aguardarTema(page, captura.tema);
  await conferirGraficos(page);
  await limparFoco(page);
  await conferirSemRolagemHorizontal(page);
  const arquivo = path.join(pasta, captura.nome);
  await page.screenshot({ path: arquivo, animations: "disabled" });
  // Capturas locais ficam fora do manifesto versionado.
  if (pasta === PASTA_FINAL) await registrarNoManifesto(captura);
  return arquivo;
}

function eRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function eViewport(valor: unknown): valor is ViewportCaptura {
  if (!eRegistro(valor)) return false;
  return (
    (valor.nome === "desktop" || valor.nome === "mobile") &&
    typeof valor.largura === "number" &&
    typeof valor.altura === "number"
  );
}

function eCapturaManifesto(valor: unknown): valor is CapturaManifesto {
  if (!eRegistro(valor)) return false;
  return (
    typeof valor.nome === "string" &&
    typeof valor.area === "string" &&
    eViewport(valor.viewport) &&
    (valor.tema === "claro" || valor.tema === "escuro") &&
    typeof valor.rota === "string"
  );
}

function interpretarManifesto(valor: unknown): ManifestoGaleria {
  if (!eRegistro(valor) || valor.versao !== VERSAO_MANIFESTO || !Array.isArray(valor.capturas)) {
    throw new Error("Manifesto da galeria inválido: esperado { versao: 1, capturas: [] }.");
  }
  const lista: unknown[] = valor.capturas;
  const capturas = lista.filter(eCapturaManifesto);
  if (capturas.length !== lista.length) {
    throw new Error("Manifesto da galeria contém uma captura com campos inválidos.");
  }
  return { versao: VERSAO_MANIFESTO, capturas };
}

async function lerManifesto(): Promise<ManifestoGaleria> {
  try {
    const conteudo = await readFile(MANIFESTO, "utf8");
    return interpretarManifesto(JSON.parse(conteudo) as unknown);
  } catch (erro) {
    if (erro instanceof Error && "code" in erro && erro.code === "ENOENT") {
      return { versao: VERSAO_MANIFESTO, capturas: [] };
    }
    throw erro;
  }
}

async function escreverManifesto(manifesto: ManifestoGaleria): Promise<void> {
  await writeFile(MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`, "utf8");
}

async function registrarNoManifesto(captura: Captura): Promise<void> {
  const manifesto = await lerManifesto();
  const registro: CapturaManifesto = {
    nome: captura.nome,
    area: captura.area,
    viewport: captura.viewport,
    tema: captura.tema,
    rota: captura.rota,
  };
  const capturas = manifesto.capturas.filter((item) => item.nome !== registro.nome);
  capturas.push(registro);
  capturas.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
  await escreverManifesto({ versao: VERSAO_MANIFESTO, capturas });
}
