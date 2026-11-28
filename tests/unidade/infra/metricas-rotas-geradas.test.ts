// Guarda o registro estático de rotas: geração, cobertura de route.ts e ordem.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROTAS_DE_METRICA } from "@/infra/metricas-rotas";
import { rotaDeMetrica } from "@/infra/metricas-rota";
import { gerarConteudo, listarRotas } from "../../../scripts/gerar-rotas-metrica.mjs";

const RAIZ = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const API = path.join(RAIZ, "src/app/api");
const GERADO = path.join(RAIZ, "src/infra/metricas-rotas.ts");
const AMOSTRAS: Record<string, string> = {
  codigo: "DOENCA",
  dia: "2026-02-10",
  id: "3f1c2f0e-5a4b-4c6d-8e7f-9012345678ab",
  numero: "42",
};

async function arquivosDeRota(diretorio: string): Promise<string[]> {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const arquivos: string[] = [];
  for (const entrada of entradas) {
    const completo = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) arquivos.push(...(await arquivosDeRota(completo)));
    else if (entrada.isFile() && entrada.name === "route.ts") arquivos.push(completo);
  }
  return arquivos;
}

/** Monta o rótulo esperado e um caminho de exemplo a partir do diretório da rota. */
function modeloDaRota(arquivo: string): { rotulo: string; exemplo: string } {
  const relativo = path.relative(API, path.dirname(arquivo));
  const segmentos = relativo === "" ? [] : relativo.split(path.sep);
  const rotulo = ["api"];
  const exemplo = ["", "api"];
  for (const segmento of segmentos) {
    const dinamico = /^\[([^\]]+)\]$/.exec(segmento);
    if (dinamico?.[1]) {
      rotulo.push(`:${dinamico[1]}`);
      exemplo.push(AMOSTRAS[dinamico[1]] ?? "exemplo-sintetico");
    } else {
      rotulo.push(segmento);
      exemplo.push(segmento);
    }
  }
  return { rotulo: `/${rotulo.join("/")}`, exemplo: exemplo.join("/") };
}

function segmentos(rotulo: string): number {
  return rotulo.split("/").length - 1;
}

function ehEstatica(rotulo: string): boolean {
  return !rotulo.split("/").some((segmento) => segmento.startsWith(":"));
}

describe("registro gerado de rotas de métricas", () => {
  it("está atualizado com os route.ts da aplicação", async () => {
    const esperado = await gerarConteudo();
    const atual = await readFile(GERADO, "utf8");

    expect(
      atual,
      "O registro está desatualizado. Rode pnpm run rotas:gerar e versione src/infra/metricas-rotas.ts.",
    ).toBe(esperado);
  });

  it("é determinístico", async () => {
    expect(await gerarConteudo()).toBe(await gerarConteudo());
  });

  it("cobre os 144 route.ts com o template correspondente", async () => {
    const arquivos = await arquivosDeRota(API);
    expect(arquivos).toHaveLength(144);

    const falhas: string[] = [];
    for (const arquivo of arquivos) {
      const { rotulo, exemplo } = modeloDaRota(arquivo);
      const obtido = rotaDeMetrica(exemplo);
      if (obtido !== rotulo) {
        falhas.push(
          `${path.relative(RAIZ, arquivo)}: ${exemplo} virou ${obtido}, esperado ${rotulo}`,
        );
      }
    }
    expect(falhas).toEqual([]);

    const modelos = arquivos.map((arquivo) => modeloDaRota(arquivo).rotulo).sort();
    const rotulos = ROTAS_DE_METRICA.map((rota) => rota.rotulo).sort();
    expect(rotulos).toEqual(modelos);
  });

  it("ordena rotas estáticas antes das dinâmicas, mais longas antes das curtas", () => {
    let viuDinamica = false;
    for (const rota of ROTAS_DE_METRICA) {
      const estatica = ehEstatica(rota.rotulo);
      if (!estatica) viuDinamica = true;
      expect(viuDinamica && estatica, rota.rotulo).toBe(false);
    }

    for (const grupo of [
      ROTAS_DE_METRICA.filter((rota) => ehEstatica(rota.rotulo)),
      ROTAS_DE_METRICA.filter((rota) => !ehEstatica(rota.rotulo)),
    ]) {
      const contagens = grupo.map((rota) => segmentos(rota.rotulo));
      expect([...contagens].sort((a, b) => b - a)).toEqual(contagens);
    }
  });

  it("mantém apenas templates estáticos nos rótulos", () => {
    for (const rota of ROTAS_DE_METRICA) {
      expect(rota.rotulo, rota.rotulo).toMatch(/^\/api(?:\/[A-Za-z0-9._~-]+|\/:[a-z]+)*$/);
      expect(rota.padrao.flags, rota.rotulo).toBe("");
      expect(rota.padrao.source.startsWith("^\\/api"), rota.rotulo).toBe(true);
      expect(rota.padrao.source.endsWith("$"), rota.rotulo).toBe(true);
    }
  });

  it("detecta rota nova sem regeneração", async () => {
    const pasta = await mkdtemp(path.join(tmpdir(), "rotas-metrica-"));
    try {
      await mkdir(path.join(pasta, "alunos/[id]"), { recursive: true });
      await mkdir(path.join(pasta, "nova"), { recursive: true });
      await writeFile(path.join(pasta, "alunos/[id]/route.ts"), "export async function GET() {}\n");
      await writeFile(path.join(pasta, "nova/route.ts"), "export async function GET() {}\n");

      const rotas = await listarRotas({ diretorioApi: pasta });
      expect(rotas.map((rota) => rota.rotulo)).toEqual(["/api/nova", "/api/alunos/:id"]);

      const conteudo = await gerarConteudo({ diretorioApi: pasta });
      expect(conteudo).toContain('rotulo: "/api/nova"');
      expect(conteudo).toContain('rotulo: "/api/alunos/:id"');
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
