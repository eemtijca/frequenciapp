# Ambiente

Variáveis de ambiente e execução local. A aplicação valida `DATABASE_URL`, `AUTH_SECRET`, `TZ_APP` e `NODE_ENV` na partida por zod em `src/infra/ambiente.ts`. Configuração ausente ou inválida derruba o processo com mensagem clara, sem estado intermediário.

## Variáveis da aplicação

| Variável     | Obrigatória | Padrão              | Descrição                                                                                                  |
| ------------ | ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| DATABASE_URL | sim         |                     | Connection string do runtime da API e do Prisma Client.                                                    |
| AUTH_SECRET  | sim         |                     | Segredo de 32 caracteres ou mais que assina o cookie de sessão. Gere com `openssl rand -base64 32`.        |
| TZ_APP       | não         | `America/Fortaleza` | Fuso usado para resolver o dia corrente, os rótulos e os limites de data. Precisa ser um fuso IANA válido. |
| NODE_ENV     | não         | `development`       | Modo de execução; em produção o cookie de sessão marca Secure.                                             |

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

| Variável    | Comando que usa          | Descrição                                               |
| ----------- | ------------------------ | ------------------------------------------------------- |
| ADMIN_EMAIL | `criar-admin`, bootstrap | E-mail do administrador inicial (primeiro usuário).     |
| ADMIN_SENHA | `criar-admin`, bootstrap | Senha do admin, mínimo 8 caracteres com letra e número. |
| ADMIN_NOME  | `criar-admin`, bootstrap | Nome de tratamento do administrador.                    |
| CONTA_EMAIL | `criar-coordenacao`      | E-mail da conta de coordenação (demonstração e testes). |
| CONTA_SENHA | `criar-coordenacao`      | Senha inicial, mínimo 8 caracteres com letra e número.  |
| CONTA_NOME  | `criar-coordenacao`      | Nome de tratamento exibido no aplicativo.               |
| SEED_ALUNOS | `seed`                   | Alunos sintéticos por turma na semente.                 |

## Execução local sem Docker

Pré-requisitos: Node.js 20.19 ou superior e um PostgreSQL 17 acessível.

```bash
npm ci
cp .env.example .env
# Edite DATABASE_URL, DIRECT_URL e cole um AUTH_SECRET aleatório
npx prisma migrate deploy
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' npm run criar-admin
CONTA_EMAIL=equipe@escola.br CONTA_SENHA='outra senha' CONTA_NOME='Equipe' npm run criar-coordenacao
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

O Compose sobe o PostgreSQL 17 com volume persistente, aplica as migrações pela `DIRECT_URL` e inicia o servidor. As URLs internas usam o host `db`. Para criar o administrador inicial na partida, defina `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` no `.env`; o bootstrap não altera uma conta que já exista. Os detalhes de orquestração estão em [deploy.md](deploy.md).

## Conexão do PostgreSQL

A aplicação aceita qualquer PostgreSQL padrão pela connection string:

- local com usuário e senha próprios;
- Supabase e provedores similares, usando a conexão direta, a Session pooler ou a Transaction pooler;
- contêiner do Docker Compose deste repositório (`db:5432`).

PostgreSQL 17 é o alvo de desenvolvimento e teste. Versões anteriores a 15 não têm suporte.

A URL do host e a URL interna do contêiner têm hosts diferentes. O `.env` do host usa `localhost`, para os comandos executados fora do Compose; o serviço `app` usa `db`, definido no `compose.yml`.

## Fuso horário

`TZ_APP` decide qual é o dia corrente para o estado inicial da frequência e é validado como fuso IANA na partida. O servidor envia o fuso e o dia corrente à interface, e toda formatação de data e hora usa esse fuso, nunca o relógio do aparelho. O dia futuro é recusado na API e desabilitado na interface. Datas trafegam como texto `YYYY-MM-DD` do calendário da escola e são armazenadas como `date` no banco em meio-dia UTC, imune a deslocamentos de fuso na gravação. A grade e o Histórico filtram por mês civil do mesmo calendário.

## Verificação rápida

```bash
curl -s http://localhost:3000/api/saude
```

Responde `{"ok":true}` quando o processo está de pé. A validação de ambiente acontece antes: sem `DATABASE_URL` válida ou sem `AUTH_SECRET`, o processo não inicia.
