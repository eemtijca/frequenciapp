// Guarda da especificação OpenAPI: cobertura das rotas, estrutura, segurança,
// referências, convenção editorial e a política de conteúdo da documentação.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import especificacao from "../../docs/openapi.json";
import { criarPoliticaDeSeguranca } from "@/infra/csp";
import { paginaDocumentacao, URL_ESPECIFICACAO } from "@/infra/documentacao";

const RAIZ = path.resolve(fileURLToPath(new URL("../../src/app/api", import.meta.url)));

/** Operações que não têm erro de requisição documentado. */
const OPERACOES_SEM_ERRO = new Set(["GET /api/saude", "GET /api/auth/sessao"]);

interface Resposta {
  description?: string;
  $ref?: string;
}

interface Operacao {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: unknown[];
  responses?: Record<string, Resposta>;
}

interface Documento {
  openapi: string;
  info: { title: string };
  servers?: unknown[];
  security?: unknown[];
  tags?: { name: string; description?: string }[];
  externalDocs?: unknown;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  };
  paths: Record<string, Record<string, Operacao>>;
}

const documento = especificacao as unknown as Documento;

const METODOS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

/** Operações declaradas nos route handlers, no formato `METODO /caminho`. */
async function operacoesDeclaradas(diretorio: string, rota = ""): Promise<string[]> {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const saida: string[] = [];
  for (const entrada of entradas) {
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      // As rotas internas da documentação não entram na especificação.
      if (rota === "" && entrada.name === "docs") continue;
      saida.push(...(await operacoesDeclaradas(caminho, `${rota}/${entrada.name}`)));
    } else if (entrada.name === "route.ts") {
      const conteudo = await readFile(caminho, "utf8");
      const metodos = [
        ...conteudo.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g),
      ];
      for (const metodo of metodos) {
        saida.push(`${metodo[1]} /api${rota.replace(/\[([^\]]+)\]/g, "{$1}")}`);
      }
    }
  }
  return saida;
}

/** Operações presentes na especificação, no formato `METODO /caminho`. */
function operacoesDoDocumento(aberto: Documento): string[] {
  const saida: string[] = [];
  for (const [caminho, item] of Object.entries(aberto.paths)) {
    for (const metodo of METODOS) {
      if (item[metodo]) saida.push(`${metodo.toUpperCase()} ${caminho}`);
    }
  }
  return saida;
}

function operacaoPorChave(chave: string): Operacao {
  const [metodo = "", caminho = ""] = chave.split(" ");
  const operacao = documento.paths[caminho]?.[metodo.toLowerCase() as (typeof METODOS)[number]];
  if (!operacao) throw new Error(`Operação ausente na especificação: ${chave}`);
  return operacao;
}

function resolverRef(referencia: string): unknown {
  return referencia
    .replace(/^#\//, "")
    .split("/")
    .reduce<unknown>((atual, parte) => {
      if (atual && typeof atual === "object") {
        return (atual as Record<string, unknown>)[parte];
      }
      return undefined;
    }, documento);
}

function coletarRefs(valor: unknown, destino: Set<string>): void {
  if (Array.isArray(valor)) {
    for (const item of valor) coletarRefs(item, destino);
    return;
  }
  if (valor && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      if (chave === "$ref" && typeof filho === "string" && filho.startsWith("#/")) {
        destino.add(filho);
      }
      coletarRefs(filho, destino);
    }
  }
}

describe("especificação OpenAPI", () => {
  it("declara OpenAPI 3.1 com informações completas", () => {
    expect(documento.openapi).toBe("3.1.0");
    expect(documento.info.title).toBe("API do FrequenciApp");
    expect(documento.servers?.length).toBeGreaterThan(0);
    expect(documento.externalDocs).toBeTruthy();
    expect(documento.security).toEqual([{ sessao: [] }]);
    expect(documento.components?.securitySchemes).toHaveProperty("sessao");
    expect(documento.components?.securitySchemes).toHaveProperty("segredoAgendador");
    expect(documento.components?.securitySchemes).toHaveProperty("chaveBi");
  });

  it("cobre exatamente as rotas da API, sem vazar rotas internas", async () => {
    const declaradas = (await operacoesDeclaradas(RAIZ)).sort();
    const documentadas = operacoesDoDocumento(documento).sort();

    expect(documentadas).toEqual(declaradas);
    expect(declaradas.length).toBeGreaterThanOrEqual(140);

    for (const caminho of Object.keys(documento.paths)) {
      expect(caminho.startsWith("/api"), `rota fora da API: ${caminho}`).toBe(true);
    }
  });

  it("dá operação única, resumo, descrição e tag declarada a cada rota", () => {
    const ids = new Set<string>();
    const tagsDeclaradas = new Set((documento.tags ?? []).map((tag) => tag.name));

    for (const [caminho, item] of Object.entries(documento.paths)) {
      for (const metodo of METODOS) {
        const operacao = item[metodo];
        if (!operacao) continue;
        const referencia = `${metodo.toUpperCase()} ${caminho}`;

        expect(operacao.operationId, `operationId ausente em ${referencia}`).toMatch(
          /^[a-z][a-zA-Z0-9]+$/,
        );
        expect(
          ids.has(operacao.operationId ?? ""),
          `operationId repetido: ${operacao.operationId}`,
        ).toBe(false);
        ids.add(operacao.operationId ?? "");

        expect(operacao.summary, `summary ausente em ${referencia}`).toBeTruthy();
        expect(operacao.description, `description ausente em ${referencia}`).toBeTruthy();
        expect(operacao.tags?.length, `tags ausentes em ${referencia}`).toBeGreaterThan(0);
        for (const tag of operacao.tags ?? []) {
          expect(tagsDeclaradas.has(tag), `tag não declarada em ${referencia}: ${tag}`).toBe(true);
        }
      }
    }
  });

  it("documenta erros e descrições em todas as respostas", () => {
    for (const chave of operacoesDoDocumento(documento)) {
      const operacao = operacaoPorChave(chave);
      const respostas = operacao.responses ?? {};
      const temErro = Object.keys(respostas).some((status) => /^4\d\d$/.test(status));

      if (OPERACOES_SEM_ERRO.has(chave)) {
        expect(temErro, `${chave} não deveria ter 4xx`).toBe(false);
      } else {
        expect(temErro, `4xx ausente em ${chave}`).toBe(true);
      }

      for (const [status, resposta] of Object.entries(respostas)) {
        if (!resposta.$ref) {
          expect(resposta.description, `descrição ausente em ${chave} ${status}`).toBeTruthy();
        }
      }
    }
  });

  it("aplica a segurança por cookie, as públicas e o segredo do agendador", () => {
    expect(operacaoPorChave("POST /api/auth/entrar").security).toEqual([]);
    expect(operacaoPorChave("GET /api/frequencias").security).toBeUndefined();
    for (const chave of ["GET /api/notificacoes/resumo", "GET /api/notificacoes/agenda"]) {
      expect(operacaoPorChave(chave).security).toEqual([{ segredoAgendador: [] }]);
    }
    expect(operacaoPorChave("GET /api/bi").security).toEqual([{ chaveBi: [] }]);
  });

  it("mantém a especificação estruturalmente íntegra e sem caracteres proibidos", () => {
    const refs = new Set<string>();
    coletarRefs(documento, refs);
    expect(refs.size).toBeGreaterThan(0);
    for (const referencia of refs) {
      expect(resolverRef(referencia), `$ref não resolvido: ${referencia}`).toBeTruthy();
    }

    const texto = JSON.stringify(documento);
    expect(texto).not.toMatch(/[\u2026\u2014\u2013\u201C\u201D\u2018\u2019\u2192\u00AB\u00BB]/);
    expect(texto).not.toMatch(/\bvocês?\b/i);
  });
});

describe("documentação interativa", () => {
  it("monta o CSP estrito, com unsafe-eval apenas na documentação", () => {
    const api = criarPoliticaDeSeguranca({
      nonce: "nonce-teste",
      desenvolvimento: false,
      exigirHttps: true,
      caminho: "/api/frequencias",
    });
    expect(api).toContain(
      "script-src 'self' https://apis.google.com 'wasm-unsafe-eval' 'nonce-nonce-teste' 'strict-dynamic'",
    );
    expect(api).not.toContain("'unsafe-eval'");
    expect(api).toContain("connect-src 'self' https://accounts.google.com");
    expect(api).toContain("upgrade-insecure-requests");
    expect(api).toContain("frame-ancestors 'none'");

    for (const caminho of ["/api/docs", "/api/docs/", "/api/docs/openapi.json"]) {
      const csp = criarPoliticaDeSeguranca({
        nonce: "nonce-teste",
        desenvolvimento: false,
        exigirHttps: true,
        caminho,
      });
      expect(csp, caminho).toContain("'strict-dynamic' 'unsafe-eval'");
    }

    const desenvolvimento = criarPoliticaDeSeguranca({
      nonce: "nonce-teste",
      desenvolvimento: true,
      exigirHttps: false,
      caminho: "/api/frequencias",
    });
    expect(desenvolvimento).toContain("'unsafe-inline' 'unsafe-eval'");
    expect(desenvolvimento).not.toContain("upgrade-insecure-requests");
  });

  it("marca todo script da página com o nonce e aponta a especificação", () => {
    const pagina = paginaDocumentacao("nonce-teste");
    const scripts = pagina.match(/<script/g) ?? [];
    const nonces = pagina.match(/nonce="nonce-teste"/g) ?? [];

    expect(scripts.length).toBeGreaterThan(0);
    expect(nonces.length).toBe(scripts.length);
    expect(pagina).toContain("/vendor/swagger-ui/swagger-ui-bundle.js");
    expect(pagina).toContain(URL_ESPECIFICACAO);
  });
});
