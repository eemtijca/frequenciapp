// Validação estrita da fixture além do contrato aceito pela API real.
import { ECDH } from "node:crypto";
import { endpointPushValido } from "../../../src/domain/notificacoes";

type DadosPush = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Obtém a origem efetiva sem incluir endereço ou credenciais em erros. */
export function validarBasePush(baseURL: string | undefined): URL {
  try {
    if (!baseURL) throw new Error();
    const base = new URL(baseURL);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password)
      throw new Error();
    return base;
  } catch {
    throw new Error("baseURL da aplicação inválida para a fixture push.");
  }
}

/** Fallback apenas fora do namespace ou para a leitura administrativa conhecida. */
export function classificarRedePush(
  endereco: string,
  metodo: string,
  corpo: string | null,
  esperado: DadosPush,
  base: URL,
): "fallback" | "get" | "post" | "delete" | "teste" | "bloquear" {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return "bloquear";
  }
  let caminho = url.pathname;
  try {
    // Decodificação repetida também captura variantes duplamente codificadas.
    for (let i = 0; i < 5; i++) {
      const proximo = decodeURIComponent(caminho);
      if (proximo === caminho) break;
      caminho = proximo;
    }
  } catch {
    return "bloquear";
  }
  // Muitas camadas de escape não podem ser classificadas com segurança.
  if (/%[0-9a-f]{2}/i.test(caminho)) return "bloquear";
  const normalizado = caminho.replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
  if (!normalizado.includes("/api/notificacoes")) return "fallback";
  if (url.origin !== base.origin) return "bloquear";
  if (
    url.pathname === "/api/notificacoes/configuracao" &&
    metodo === "GET" &&
    !url.search &&
    corpo === null
  )
    return "fallback";
  if (url.pathname === "/api/notificacoes/assinatura" && metodo === "GET") {
    const parametros = [...url.searchParams.keys()];
    return corpo === null &&
      parametros.every((chave) => chave === "endpoint") &&
      url.searchParams.getAll("endpoint").length <= 1 &&
      (!url.searchParams.has("endpoint") || url.searchParams.get("endpoint") === esperado.endpoint)
      ? "get"
      : "bloquear";
  }
  const rota =
    url.pathname === "/api/notificacoes/assinatura"
      ? "assinatura"
      : url.pathname === "/api/notificacoes/teste"
        ? "teste"
        : null;
  if (!rota || url.search) return "bloquear";
  try {
    validarPedidoPush(rota, metodo, corpo, esperado);
    if (rota === "teste") return "teste";
    return metodo === "POST" ? "post" : "delete";
  } catch {
    return "bloquear";
  }
}

export function correspondeRespostaPush(
  endereco: string,
  metodoRecebido: string,
  base: URL,
  metodo: string,
  endpoint: "assinatura" | "teste",
): boolean {
  try {
    const url = new URL(endereco);
    return (
      url.origin === base.origin &&
      url.pathname === `/api/notificacoes/${endpoint}` &&
      metodoRecebido === metodo
    );
  } catch {
    return false;
  }
}

function objetoExato(valor: unknown, nomes: string[]): valor is Record<string, unknown> {
  return (
    valor !== null &&
    typeof valor === "object" &&
    !Array.isArray(valor) &&
    Object.keys(valor).length === nomes.length &&
    nomes.every((nome) => Object.hasOwn(valor, nome))
  );
}

export function validarPedidoPush(
  rota: string,
  metodo: string,
  corpo: string | null,
  esperado: DadosPush,
): void {
  try {
    if (corpo === null) throw new Error();
    const dados: unknown = JSON.parse(corpo);
    const ativacao = rota === "assinatura" && metodo === "POST";
    const endpointApenas =
      (rota === "assinatura" && metodo === "DELETE") || (rota === "teste" && metodo === "POST");
    if (!ativacao && !endpointApenas) throw new Error();
    if (!objetoExato(dados, ativacao ? ["endpoint", "keys"] : ["endpoint"])) throw new Error();
    if (
      typeof dados.endpoint !== "string" ||
      !endpointPushValido(dados.endpoint) ||
      dados.endpoint !== esperado.endpoint
    )
      throw new Error();
    if (ativacao) {
      if (!objetoExato(dados.keys, ["p256dh", "auth"])) throw new Error();
      const { p256dh, auth } = dados.keys;
      if (
        typeof p256dh !== "string" ||
        !/^B[A-Za-z0-9_-]{86}$/.test(p256dh) ||
        p256dh !== esperado.keys.p256dh ||
        typeof auth !== "string" ||
        !/^[A-Za-z0-9_-]{22}$/.test(auth) ||
        auth !== esperado.keys.auth
      )
        throw new Error();
      ECDH.convertKey(Buffer.from(p256dh, "base64url"), "prime256v1");
    }
  } catch {
    throw new Error("Requisição push simulada inválida.");
  }
}
