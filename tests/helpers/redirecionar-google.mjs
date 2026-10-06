// Transporte exclusivo das suítes: encaminha credenciais sintéticas ao Google
// falso no loopback, sem alterar os endereços ou clientes do aplicativo.
const prefixo = "frequenciapp-teste:";
const fetchOriginal = globalThis.fetch;

function origemDoTeste(token) {
  if (!token?.startsWith(prefixo)) return null;
  const origem = new URL(Buffer.from(token.slice(prefixo.length), "base64url").toString());
  if (origem.protocol !== "http:" || origem.hostname !== "127.0.0.1") {
    throw new Error("O transporte sintético aceita somente o servidor de teste no loopback.");
  }
  return origem.origin;
}

globalThis.fetch = async (entrada, opcoes) => {
  const requisicao = entrada instanceof Request ? entrada : null;
  const url = new URL(requisicao?.url ?? String(entrada));
  let origem = null;
  if (url.origin === "https://oauth2.googleapis.com" && url.pathname === "/token") {
    const corpo = opcoes?.body ?? (requisicao ? await requisicao.clone().text() : "");
    const parametros = new URLSearchParams(String(corpo));
    origem = origemDoTeste(parametros.get("refresh_token") ?? parametros.get("code"));
  } else if (url.origin === "https://sheets.googleapis.com") {
    const headers = new Headers(opcoes?.headers ?? requisicao?.headers);
    origem = origemDoTeste(headers.get("Authorization")?.replace(/^Bearer /, ""));
  }
  if (!origem) return fetchOriginal(entrada, opcoes);
  const destino = `${origem}${url.pathname}${url.search}`;
  return fetchOriginal(requisicao ? new Request(destino, requisicao) : destino, opcoes);
};
