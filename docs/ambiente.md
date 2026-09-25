# Ambiente

Variáveis de ambiente e execução local. Todas são validadas na partida por zod em `src/infra/ambiente.ts`: configuração ausente ou inválida derruba a aplicação com mensagem clara, sem estado intermediário.

## Variáveis

| Variável     | Obrigatória | Padrão              | Descrição                                                                                           |
| ------------ | ----------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| DATABASE_URL | sim         |                     | Connection string PostgreSQL: `postgresql://usuario:senha@host:porta/banco`.                        |
| AUTH_SECRET  | sim         |                     | Segredo de 32 caracteres ou mais que assina o cookie de sessão. Gere com `openssl rand -base64 32`. |
| TZ_APP       | não         | `America/Fortaleza` | Fuso usado para resolver o dia corrente e o rótulo de datas.                                        |
| NODE_ENV     | não         | `development`       | Modo de execução; em produção o cookie de sessão marca Secure.                                      |

Variáveis de script, usadas apenas pelos comandos de linha e nunca pela aplicação:

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
npm install
cp .env.example .env
# Edite DATABASE_URL e cole um AUTH_SECRET aleatório
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
# Defina apenas AUTH_SECRET; o restante segue o padrão do compose.yml
docker compose up --build
```

O Compose sobe o PostgreSQL 17 com volume persistente, aplica as migrações na partida e inicia o servidor. Os detalhes de orquestração estão em [deploy.md](deploy.md).

## Conexão do PostgreSQL

A aplicação aceita qualquer PostgreSQL padrão pela connection string:

- local com usuário e senha próprios;
- Supabase e provedores similares, usando a conexão direta `:5432` ou o pooler de sessão;
- contêiner do Docker Compose deste repositório (`db:5432`).

PostgreSQL 17 é o alvo de desenvolvimento e teste; versões anteriores a 15 não têm suporte, e o 17 é recomendado por reunir as melhorias de vacuum e desempenho relevantes para o volume do aplicativo.

O mesmo valor de `DATABASE_URL` serve ao runtime e ao CLI do Prisma. Quando o provedor separar conexão de CLI (pooler de transação `:6543`), exporte também `DIRECT_URL` apontando para a conexão direta no momento de rodar migrações, sem alterar o código.

## Fuso horário

`TZ_APP` decide qual é o dia corrente para o estado inicial da Chamada. Datas trafegam como texto `YYYY-MM-DD` do calendário local do professor e são armazenadas como `date` no banco em meio-dia UTC, imune a deslocamentos de fuso na gravação. A grade de Originais e o Histórico filtram por mês civil do mesmo calendário.

## Verificação rápida

```bash
curl -s http://localhost:3000/api/saude
```

Responde `{"ok":true}` quando o processo está de pé. A validação de ambiente acontece antes: sem `DATABASE_URL` válida ou sem `AUTH_SECRET`, o processo não inicia.
