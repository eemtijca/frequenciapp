// Guardas das rotas: todo manipulador da API passa por uma guarda de
// capacidade, salvo as rotas públicas listadas com o motivo.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve("src/app/api");

/** Rotas abertas de propósito, cada uma com o motivo. */
const PUBLICAS: Record<string, string> = {
  "auth/entrar POST": "é a própria entrada; valida credenciais e limita tentativas",
  "auth/sair POST": "encerra a sessão do cookie recebido, se houver",
  "auth/sessao GET": "informa se há sessão, sem dado escolar",
  "saude GET": "verificação de saúde do contêiner, sem dado escolar",
  "docs GET": "interface de documentação pública, sem dado escolar",
  "docs/api.md GET": "referência pública em Markdown, sem dado escolar",
  "docs/openapi.json GET": "especificação pública das rotas, sem dado escolar",
};

const GUARDA = /\bexigir(?:Capacidade|Sessao|Admin)\(/;
/** A guarda só protege quando a recusa é devolvida antes do restante do corpo. */
const RECUSA = /if \(!\w+\.ok\)/;
const METODOS = "GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE";
/** Formas de exportar manipulador que o recorte por `export async function` não enxerga. */
const OUTRAS_FORMAS = new RegExp(
  `\\bexport\\s+(?:(?:const|let|var)\\s+(?:${METODOS})\\b|function\\s+(?:${METODOS})\\b|\\{[^}]*\\b(?:${METODOS})\\b[^}]*\\})`,
);

/** Comentários não contam como guarda. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function arquivosDeRota(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((nome) => {
    const caminho = path.join(diretorio, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeRota(caminho);
    return /^route\.[cm]?[jt]sx?$/.test(nome) ? [caminho] : [];
  });
}

function rotas(diretorio: string): string[] {
  return arquivosDeRota(diretorio).filter((caminho) => path.basename(caminho) === "route.ts");
}

interface Manipulador {
  chave: string;
  corpo: string;
}

function manipuladores(arquivo: string): Manipulador[] {
  const codigo = semComentarios(readFileSync(arquivo, "utf8"));
  const rota = path.relative(RAIZ, path.dirname(arquivo)).split(path.sep).join("/");
  const partes = codigo.split(/export async function (GET|POST|PATCH|PUT|DELETE)\b/);
  const saida: Manipulador[] = [];
  for (let indice = 1; indice < partes.length; indice += 2) {
    saida.push({ chave: `${rota} ${partes[indice]}`, corpo: partes[indice + 1] ?? "" });
  }
  return saida;
}

const todos = rotas(RAIZ).flatMap(manipuladores);

describe("guardas das rotas da API", () => {
  it("encontra os manipuladores", () => {
    expect(todos.length).toBeGreaterThan(50);
  });

  it.each(todos.map((item) => [item.chave, item] as const))(
    "%s passa por uma guarda ou está na lista pública",
    (chave, item) => {
      if (chave === "bi GET") {
        expect(item.corpo).toMatch(/exigirChaveBi\(requisicao\)/);
        expect(GUARDA.test(item.corpo)).toBe(false);
        return;
      }
      if (
        chave === "notificacoes/resumo GET" ||
        chave === "notificacoes/agenda GET" ||
        chave === "planilha/fila/agenda GET" ||
        chave === "indicadores/agenda GET"
      ) {
        // As agendas usam Bearer independente do cookie, conforme a ADR-028, a ADR-039 e a ADR-040.
        expect(item.corpo).toMatch(
          /segredoDaAgendaConfere\(requisicao\.headers\.get\("authorization"\)\)/,
        );
        expect(GUARDA.test(item.corpo)).toBe(false);
        return;
      }
      if (chave in PUBLICAS) {
        expect(GUARDA.test(item.corpo)).toBe(false);
        return;
      }
      expect(GUARDA.test(item.corpo)).toBe(true);
      expect(RECUSA.test(item.corpo)).toBe(true);
    },
  );

  it("declara rotas só em route.ts e manipuladores só como export async function", () => {
    const raizApp = path.resolve("src/app");
    const outrosArquivos = arquivosDeRota(raizApp).filter(
      (caminho) => path.basename(caminho) !== "route.ts",
    );
    expect(outrosArquivos).toEqual([]);
    const outrasFormas = arquivosDeRota(raizApp).filter((caminho) =>
      OUTRAS_FORMAS.test(semComentarios(readFileSync(caminho, "utf8"))),
    );
    expect(outrasFormas.map((caminho) => path.relative(raizApp, caminho))).toEqual([]);
  });

  it("não usa server actions, que ficariam fora desta conferência", () => {
    const pendentes: string[] = [];
    const varrer = (diretorio: string) => {
      for (const nome of readdirSync(diretorio)) {
        const caminho = path.join(diretorio, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (
          /\.[jt]sx?$/.test(nome) &&
          /^\s*["']use server["']/m.test(readFileSync(caminho, "utf8"))
        )
          pendentes.push(path.relative(path.resolve("src"), caminho));
      }
    };
    varrer(path.resolve("src"));
    expect(pendentes).toEqual([]);
  });

  it("não decide acesso pelo papel dentro das rotas", () => {
    const porPapel = todos.filter((item) => /\.papel\s*[!=]==/.test(item.corpo));
    expect(porPapel.map((item) => item.chave)).toEqual([]);
  });

  it("mantém a lista pública apenas com rotas que existem", () => {
    const chaves = new Set(todos.map((item) => item.chave));
    expect(Object.keys(PUBLICAS).filter((chave) => !chaves.has(chave))).toEqual([]);
  });
});
