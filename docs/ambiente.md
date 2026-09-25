# Ambiente

Variáveis de ambiente e execução local. A aplicação valida `DATABASE_URL`, `AUTH_SECRET`, `TZ_APP` e `NODE_ENV` na partida por zod em `src/infra/ambiente.ts`. Configuração ausente ou inválida derruba o processo com mensagem clara, sem estado intermediário.

## Variáveis da aplicação

| Variável     | Obrigatória | Padrão              | Descrição                                                                                           |
| ------------ | ----------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| DATABASE_URL | sim         |                     | Connection string do runtime da API e do Prisma Client.                                             |
| AUTH_SECRET  | sim         |                     | Segredo de 32 caracteres ou mais que assina o cookie de sessão. Gere com `openssl rand -base64 32`. |
| TZ_APP       | não         | `America/Fortaleza` | Fuso usado para resolver o dia corrente e os rótulos de datas.                                      |
| NODE_ENV     | não         | `development`       | Modo de execução; em produção o cookie de sessão marca Secure.                                      |

## Conexões do Prisma e do Supabase

| Variável     | Uso                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL | Runtime da API e Prisma Client. No Supabase, Transaction pooler na porta 6543.                                        |
| DIRECT_URL   | Prisma CLI, migrations, Studio, migrador Docker e scripts administrativos. No Supabase, Session pooler na porta 5432. |

Exemplo de produção:

```text
DATABASE_URL=postgresql://prisma.PROJECT_REF:SENHA@POOLER_HOST:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://prisma.PROJECT_REF:SENHA@POOLER_HOST:5432/postgres?sslmode=require
```

O host, o usuário e a senha devem ser copiados do painel do Supabase. A senha precisa estar codificada para URL. A Transaction pooler é usada pelo runtime serverless. A Session pooler é usada pelo CLI e por operações que preservam estado de conexão.

A conexão do runtime também pode usar uma conexão direta ou o pooler de sessão em ambientes persistentes. O Supabase em Vercel deve usar a Transaction pooler.

## Variáveis de script

| Variável    | Comando que usa | Descrição                                               |
| ----------- | --------------- | ------------------------------------------------------- |
| ADMIN_EMAIL | `criar-admin`   | E-mail do administrador inicial (primeiro usuário).     |
| ADMIN_SENHA | `criar-admin`   | Senha do admin, mínimo 8 caracteres com letra e número. |
| ADMIN_NOME  | `criar-admin`   | Nome de tratamento do administrador.                    |
| CONTA_EMAIL | `criar-conta`   | E-mail da conta de professor (demonstração e testes).   |
| CONTA_SENHA | `criar-conta`   | Senha inicial, mínimo 8 caracteres com letra e número.  |
| CONTA_NOME  | `criar-conta`   | Nome de tratamento exibido no aplicativo.               |
| SEED_ALUNOS | `seed`          | Alunos sintéticos por turma na semente.                 |

## Execução local sem Docker

Pré-requisitos: Node.js 20.19 ou superior e um PostgreSQL 17 acessível.

```bash
npm ci
cp .env.example .env
# Edite DATABASE_URL, DIRECT_URL e cole um AUTH_SECRET aleatório
npx prisma migrate deploy
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' npm run criar-admin
CONTA_EMAIL=professor@escola.br CONTA_SENHA='outra senha' CONTA_NOME='Ana' npm run criar-conta
npm run seed  # opcional, séries, turmas e alunos sintéticos
npm run dev
```

O aplicativo responde em http://localhost:3000. A página única é dinâmica: cada carregamento resolve a sessão e busca os dados correntes.

## Com Docker Compose

```bash
cp .env.example .env
# Defina AUTH_SECRET; o restante segue o padrão do compose.yml
docker compose up --build
```

O Compose sobe o PostgreSQL 17 com volume persistente, aplica as migrações pela `DIRECT_URL` e inicia o servidor. Os detalhes de orquestração estão em [deploy.md](deploy.md).

### GitHub Codespaces

A imagem padrão do Codespaces pode bloquear a comunicação bridge entre os serviços `app` e `db`, mesmo com o PostgreSQL saudável. Use o override versionado:

```bash
docker compose -f compose.yml -f compose.local.yml up --build
```

O arquivo `compose.local.yml` mantém o banco no serviço `db`, mas faz o contêiner da aplicação alcançar a porta publicada no host por `host.docker.internal`. Ele é específico para esse ambiente; o comando normal continua sendo `docker compose up --build` fora do Codespaces. Os detalhes de diagnóstico estão em [deploy.md](deploy.md).

## Conexão do PostgreSQL

A aplicação aceita qualquer PostgreSQL padrão pela connection string:

- local com usuário e senha próprios;
- Supabase e provedores similares, usando a conexão direta, a Session pooler ou a Transaction pooler;
- contêiner do Docker Compose deste repositório (`db:5432`).

PostgreSQL 17 é o alvo de desenvolvimento e teste. Versões anteriores a 15 não têm suporte.

A URL do host e a URL interna do contêiner têm hosts diferentes. O `.env` do host usa `localhost`; o serviço Compose usa `db` por padrão. O override `compose.local.yml` troca apenas o host visto pelo serviço `app` para `host.docker.internal`, necessário em alguns Codespaces.

## Fuso horário

`TZ_APP` decide qual é o dia corrente para o estado inicial da frequência. Datas trafegam como texto `YYYY-MM-DD` do calendário local do professor e são armazenadas como `date` no banco em meio-dia UTC, imune a deslocamentos de fuso na gravação. A grade de Originais e o Histórico filtram por mês civil do mesmo calendário.

## Verificação rápida

```bash
curl -s http://localhost:3000/api/saude
```

Responde `{"ok":true}` quando o processo está de pé. A validação de ambiente acontece antes: sem `DATABASE_URL` válida ou sem `AUTH_SECRET`, o processo não inicia.
