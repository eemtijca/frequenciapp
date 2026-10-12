// Política de segurança de conteúdo por URL: estrita na aplicação, com
// `unsafe-eval` apenas na documentação interativa, exigido pelo "Try it out".

interface OpcoesCsp {
  nonce: string;
  desenvolvimento: boolean;
  exigirHttps: boolean;
  caminho: string;
}

/** Diretivas iguais em toda a aplicação. O script-src é montado à parte. */
const DIRETIVAS_FIXAS = [
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "worker-src 'self' blob:",
  "child-src blob:",
  "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
  "frame-src https://docs.google.com https://drive.google.com",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

/**
 * Monta o CSP da requisição. A documentação interativa recebe `unsafe-eval`
 * porque a validação do "Try it out" (ajv) compila o schema em tempo de execução.
 */
export function criarPoliticaDeSeguranca({
  nonce,
  desenvolvimento,
  exigirHttps,
  caminho,
}: OpcoesCsp): string {
  const documentacao = caminho === "/api/docs" || caminho.startsWith("/api/docs/");
  const scriptSrc = desenvolvimento
    ? "'self' https://apis.google.com 'wasm-unsafe-eval' 'unsafe-inline' 'unsafe-eval'"
    : `'self' https://apis.google.com 'wasm-unsafe-eval' 'nonce-${nonce}' 'strict-dynamic'${
        documentacao ? " 'unsafe-eval'" : ""
      }`;

  const diretivas = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    ...DIRETIVAS_FIXAS,
    // Sem TLS, forçar upgrade quebraria os recursos da própria página.
    ...(exigirHttps ? ["upgrade-insecure-requests"] : []),
  ];

  return diretivas.join("; ");
}
