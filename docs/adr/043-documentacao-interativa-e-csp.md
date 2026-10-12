# ADR-043: documentação interativa e CSP por URL

- Estado: aceita.
- Data: 2026.

## Contexto

A API não publicava especificação nem interface de teste, e as rotas eram documentadas apenas em [api.md](../api.md). A interface do Swagger UI valida as requisições do "Try it out" com ajv, que compila o schema em tempo de execução e exige `'unsafe-eval'` no `script-src`, incompatível com a política estrita por nonce usada em produção.

## Decisão

1. Publicar `docs/openapi.json` (OpenAPI 3.1) mantido no repositório e servido em `GET /api/docs/openapi.json`, com a versão em Markdown em `GET /api/docs/api.md`, que acompanha a função no standalone e na Vercel via `outputFileTracingIncludes`.
2. Servir o Swagger UI em `GET /api/docs`, com os assets copiados de `node_modules/swagger-ui-dist` para `public/vendor/swagger-ui` no `postinstall` e marcados com o nonce da CSP.
3. Montar o CSP por URL em `src/infra/csp.ts`: estrito em toda a aplicação e `'unsafe-eval'` apenas em `/api/docs`, exigido pela validação do "Try it out".
4. Proteger a cobertura com `tests/unit/openapi.test.ts` (rotas contra especificação, estrutura, segurança, `$ref`, convenção editorial e CSP) e aplicar o lint do Redocly CLI em `pnpm run lint:api`, no workflow de qualidade.

## Alternativas consideradas

- Especificação escrita à mão sem guarda: descartada pela divergência rápida em relação ao código.
- Swagger UI por CDN: descartada pela CSP restritiva e pelo funcionamento sem internet.
- CSP frouxa na aplicação inteira: descartada por ampliar a superfície de XSS sem necessidade.

## Consequências

- A documentação passa a acompanhar o código, com guarda de cobertura e lint no CI.
- A rota da interface tem um relaxamento pontual de CSP, registrado em [seguranca.md](../seguranca.md).

Referências: [api.md](../api.md), [seguranca.md](../seguranca.md) e [testes.md](../testes.md).
