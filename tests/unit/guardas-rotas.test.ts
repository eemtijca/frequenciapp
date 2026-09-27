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
};

const GUARDA = /\bexigir(?:Capacidade|Sessao|Admin)\(/;

function rotas(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((nome) => {
    const caminho = path.join(diretorio, nome);
    if (statSync(caminho).isDirectory()) return rotas(caminho);
    return nome === "route.ts" ? [caminho] : [];
  });
}

interface Manipulador {
  chave: string;
  corpo: string;
}

function manipuladores(arquivo: string): Manipulador[] {
  const codigo = readFileSync(arquivo, "utf8");
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
      if (chave in PUBLICAS) {
        expect(GUARDA.test(item.corpo)).toBe(false);
        return;
      }
      expect(GUARDA.test(item.corpo)).toBe(true);
    },
  );

  it("não decide acesso pelo papel dentro das rotas", () => {
    const porPapel = todos.filter((item) => /\.papel\s*[!=]==/.test(item.corpo));
    expect(porPapel.map((item) => item.chave)).toEqual([]);
  });

  it("mantém a lista pública apenas com rotas que existem", () => {
    const chaves = new Set(todos.map((item) => item.chave));
    expect(Object.keys(PUBLICAS).filter((chave) => !chaves.has(chave))).toEqual([]);
  });
});
