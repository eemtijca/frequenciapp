// Página da documentação interativa (Swagger UI) servida em /api/docs.

/** URL pública da especificação OpenAPI. */
export const URL_ESPECIFICACAO = "/api/docs/openapi.json";

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
