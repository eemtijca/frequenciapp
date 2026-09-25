# ADR-001: PostgreSQL via connection string com Prisma

## Estado

Aceita.

## Contexto

O aplicativo original usava SQLite local com Drizzle e dependia de integrações externas para persistência remota. A reconstrução exige back-end próprio com PostgreSQL acessado por connection string e manipulado com Prisma ORM, sem amarrar o projeto a um provedor específico.

## Decisão

- PostgreSQL 17 como banco único, na versão testada e recomendada.
- `DATABASE_URL` para o runtime da API e o Prisma Client. No Supabase, usa a Transaction pooler com `pgbouncer=true` e `sslmode=require`.
- `DIRECT_URL` para Prisma CLI, migrations, Studio e scripts administrativos. No Supabase, usa a Session pooler ou uma conexão direta.
- `prisma.config.ts` prioriza `DIRECT_URL` para o CLI, com fallback local para geração do cliente durante o build.
- Prisma 7 com o gerador novo `prisma-client` e código gerado em `generated/` (fora do controle de versão): cliente sem processo Rust, importado pelo runtime junto com o adaptador oficial `pg` (`PrismaPg`). O CLI lê a connection string de `prisma.config.ts`.
- Unicidades insensíveis a caixa (e-mail, série, turma por série) ficam em índices funcionais no SQL das migrações, porque o gerador não as representa.

## Consequências

- O mesmo esquema roda em Docker Compose, Supabase, instância própria ou qualquer PostgreSQL compatível; o 17 é o alvo de desenvolvimento e teste.
- `prisma generate` roda no `postinstall`; o build precisa do `generated/` presente, e o diretório não entra no repositório.
- Migrações versionadas em SQL, aplicáveis com `prisma migrate deploy` e pelo migrador do contêiner, interoperáveis.
- Nenhuma dependência de plataforma específica de banco no código da aplicação.
