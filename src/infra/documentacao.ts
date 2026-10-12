// Página da documentação interativa (Swagger UI) servida em /api/docs.

/** URL pública da especificação OpenAPI. */
export const URL_ESPECIFICACAO = "/api/docs/openapi.json";

/** Caminho público do índice para agentes de IA. */
export const CAMINHO_INDICE_AGENTES = "/llms.txt";

/** Cabeçalhos de requisição que bastam para montar a origem pública. */
interface CabecalhosDaRequisicao {
  get(nome: string): string | null;
}

/**
 * Monta a URL do índice para agentes na origem que atendeu a requisição,
 * para o link valer em qualquer domínio de produção. Sem host nos cabeçalhos,
 * devolve o caminho relativo e o navegador resolve pelo domínio da página.
 */
export function urlDoIndiceDeAgentes(cabecalhos: CabecalhosDaRequisicao): string {
  const host = (cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host"))
    ?.split(",")[0]
    ?.trim();
  if (!host) return CAMINHO_INDICE_AGENTES;
  const local =
    host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1");
  const protocolo =
    cabecalhos.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() ??
    (local ? "http" : "https");
  return `${protocolo}://${host}${CAMINHO_INDICE_AGENTES}`;
}

/**
 * Monta a página do Swagger UI com o nonce da CSP. Os assets são servidos de
 * /vendor/swagger-ui, copiados de node_modules no postinstall.
 */
export function paginaDocumentacao(nonce: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API do FrequenciApp</title>
    <link rel="stylesheet" href="/vendor/swagger-ui/swagger-ui.css" />
    <link rel="icon" href="/icon-192.png" type="image/png" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script nonce="${nonce}" src="/vendor/swagger-ui/swagger-ui-bundle.js"></script>
    <script nonce="${nonce}">
      window.ui = SwaggerUIBundle({
        url: "${URL_ESPECIFICACAO}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        defaultModelsExpandDepth: 1,
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        withCredentials: true,
      });
    </script>
  </body>
</html>`;
}
