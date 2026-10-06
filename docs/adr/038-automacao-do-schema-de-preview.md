# ADR-038: Automação do schema de preview por pull request

Estado: aceita. Data: 2026-10-06.

## Contexto

O Preview compartilha o database da produção e usa um schema próprio, com os papéis `preview_app` e `preview_migrador` sem acesso a `public`. O preparo era manual: aplicar as migrações e criar a conta de teste a cada mudança de banco. Com dois pull requests mexendo em `prisma/**` ao mesmo tempo, o schema compartilhado acumulava migrações não fundidas e o preview de um podia quebrar o do outro. Dependabot e pull requests de fork não recebem os segredos do GitHub Actions, e a Vercel publica previews de branches sem conhecer o schema escolhido.

## Decisão

- O workflow `schema-preview.yml` cria, migra e remove `preview_pr_<número>` para pull requests do próprio repositório que mudam `prisma/**`.
- O schema de fallback `preview` é mantido em dia por um job em cada push na `main`. Pull requests sem mudança de banco, Dependabot e forks usam esse fallback.
- A limpeza roda no fechamento do pull request e uma faxina semanal derruba schemas órfãos, consultando os pull requests abertos pela API do GitHub.
- O apontamento da branch é opcional: com `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` e a branch do pull request, o workflow define `DATABASE_SCHEMA=preview_pr_<número>` no escopo da branch e dispara um deployment. Sem o token, o schema é criado e migrado, e a branch usa o fallback até o ajuste manual.
- O aplicativo continua agnóstico: a seleção de schema vem de `DATABASE_SCHEMA` ou do parâmetro da URL, sem variável de plataforma no código.
- O script `scripts/preview-schema.mjs` concentra criar, limpar e fiscalizar; o migrador e o `criar-admin` são reaproveitados, com a trava consultiva alinhada ao Prisma CLI.

## Alternativas

Manter o preparo manual deixaria a colisão entre pull requests e o erro de apontamento. Usar um banco por pull request exigiria plano pago do Supabase ou outro provedor, contrariando a decisão de manter a Vercel e o Supabase como uma opção entre outras. Rodar as migrações no build da Vercel executaria DDL a cada build e levaria credencial de migração ao runtime. Derivar o schema no código a partir de variáveis da plataforma quebraria o agnosticismo e não cobriria Dependabot e forks.

## Consequências

- Cada pull request de banco tem migrações, contas e dados isolados; o fallback cobre o restante.
- O schema de preview vira estado descartável: a faxina e o fechamento removem o que sobra, e a reconstrução é sempre possível pelo workflow.
- O workflow exige o environment `preview` com `DIRECT_URL_PREVIEW` e `ADMIN_SENHA_PREVIEW`; sem eles, o job falha de forma visível em vez de migrar o destino errado.
- O apontamento automático da Vercel depende de um token e de variáveis; sem eles, o ajuste é manual e documentado.
- A faxina depende da API do GitHub e roda semanalmente; schemas de pull requests abertos são preservados.
