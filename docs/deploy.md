# Deploy

O FrequenciApp é um processo Node único com página, rotas de API e service worker. O build de produção usa `npm run build`. O banco pode ser o PostgreSQL do Compose ou uma instância gerenciada.

## Docker Compose local

```bash
cp .env.example .env
# Defina AUTH_SECRET com openssl rand -base64 32
docker compose up --build
```

O `compose.yml` sobe:

- `db`: PostgreSQL 17 com volume `pgdata` e healthcheck;
- `app`: imagem construída pelo `Dockerfile`, que aplica as migrações pela `DIRECT_URL` e serve na porta 3000.

As URLs dentro do contêiner usam o host `db`:

```text
postgresql://frequencia:frequencia@db:5432/frequencia
```

O `.env` do host usa `localhost`, para permitir executar `npm run criar-admin`, `npm run criar-conta`, `npm run seed` e a suíte de API contra o banco publicado.

Criação do administrador inicial e da semente dentro do contêiner:

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' \
  docker compose exec app npm run criar-admin
SEED_ALUNOS=12 docker compose exec app npm run seed
```

O restante da configuração é feito pela área de Gestão do aplicativo.

Para testar com um projeto isolado, sem destruir um volume local existente:

```bash
docker compose -p frequenciapp-test up --build -d
curl -fsS http://localhost:3000/api/saude
docker compose -p frequenciapp-test down -v --remove-orphans
```

Se a migration inicial for recriada durante o desenvolvimento, bancos antigos precisam ser removidos ou recriados. O comando `npx prisma migrate reset --force` também serve para um ambiente local descartável.

## Imagem avulsa

```bash
docker build -t frequenciapp .
docker run -p 3000:3000 \
  -e DATABASE_URL='postgresql://usuario:senha@host:5432/banco' \
  -e DIRECT_URL='postgresql://usuario:senha@host:5432/banco' \
  -e AUTH_SECRET='segredo de 32 bytes' \
  frequenciapp
```

O contêiner espera o banco, aplica as migrações e inicia o servidor standalone. O migrador tolera indisponibilidade inicial do banco por até 2 minutos.

## Supabase

A configuração de produção separa o tráfego da aplicação das operações de CLI:

| Uso                                            | Variável       | Conexão Supabase                 |
| ---------------------------------------------- | -------------- | -------------------------------- |
| API Vercel e Prisma Client                     | `DATABASE_URL` | Transaction pooler, porta 6543   |
| Prisma CLI, migrations, Studio e administração | `DIRECT_URL`   | Session pooler, porta 5432       |
| Backup, restauração e rotinas SQL              | `DIRECT_URL`   | Session pooler ou conexão direta |

Exemplos de formato:

```text
DATABASE_URL=postgresql://prisma.PROJECT_REF:SENHA@POOLER_HOST:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://prisma.PROJECT_REF:SENHA@POOLER_HOST:5432/postgres?sslmode=require
```

O host, o índice e o usuário devem ser copiados do painel do Supabase. A senha precisa estar codificada para URL. A transaction pooler é indicada para funções serverless e a session pooler preserva o estado necessário para operações de migração.

O `pgbouncer=true` desativa prepared statements no Prisma Client, conforme a documentação do Supabase. O runtime usa o adaptador `pg` com pool pequeno na Vercel, inicialmente com uma conexão por instância.

Para uma role dedicada, crie um usuário PostgreSQL com permissões no schema `public` e use o usuário correspondente nas duas URLs. O papel de migração precisa criar e alterar tabelas, índices, sequences e constraints.

O `.env` local contém exemplos completos em [`.env.example`](../.env.example). O `prisma.config.ts` prioriza `DIRECT_URL` para o CLI, com fallback local para permitir geração do cliente durante o build.

## Vercel

A Vercel usa a integração nativa de Git para publicar a `main`. O arquivo `vercel.json` define:

- framework `nextjs`;
- `npm ci` como instalação;
- `npm run vercel-build` como build;
- saída `.next`;
- URLs limpas e cabeçalhos de segurança.

Configure no projeto Vercel, para produção e previews:

- `DATABASE_URL` com a Transaction pooler do Supabase;
- `DIRECT_URL` com a Session pooler, necessária durante o build e para operações de CLI;
- `AUTH_SECRET` com pelo menos 32 caracteres;
- `TZ_APP`, opcionalmente `America/Fortaleza`.

Não defina a senha do Supabase no repositório. Use as configurações de ambiente da Vercel.

### Ordem de publicação

1. provisionar o projeto Supabase e a role do aplicativo;
2. configurar `DATABASE_URL` e `DIRECT_URL` na Vercel;
3. configurar `DIRECT_URL_PROD` como segredo do GitHub;
4. aplicar as migrations pelo workflow `db-migrate.yml`;
5. confirmar `npx prisma migrate status` com a conexão de sessão;
6. publicar a `main` na Vercel;
7. verificar login, frequência, histórico e `/api/saude`.

O build da Vercel não executa migrations. O workflow de CD usa `DIRECT_URL_PROD`, que deve conter a Session pooler.

## GitHub Actions

Os workflows ficam em `.github/workflows/`:

| Workflow         | Responsabilidade                                             |
| ---------------- | ------------------------------------------------------------ |
| `quality.yml`    | Formatação, lint, tipos e testes unitários                   |
| `build.yml`      | Build de produção do Next.js                                 |
| `test-db.yml`    | Compose, migração, contas de teste e contratos de API        |
| `db-migrate.yml` | `prisma migrate deploy` na `main` e no ambiente `production` |
| `codeql.yml`     | Análise de segurança de JavaScript e TypeScript              |
| `publicacao.yml` | Publicação da imagem no GHCR                                 |

O Dependabot atualiza npm, GitHub Actions e Docker semanalmente, agrupando versões minor e patch.

## Máquina própria com systemd

Build e execução diretos:

```bash
npm ci
npm run build
DATABASE_URL=... DIRECT_URL=... AUTH_SECRET=... npm start
```

Exemplo de unidade mínima:

```ini
[Unit]
Description=FrequenciApp
After=network-online.target postgresql.service

[Service]
WorkingDirectory=/opt/frequenciapp
Environment=DATABASE_URL=postgresql://frequencia:senha@localhost:5432/frequencia
Environment=DIRECT_URL=postgresql://frequencia:senha@localhost:5432/frequencia
EnvironmentFile=/opt/frequenciapp/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
User=frequenciapp

[Install]
WantedBy=multi-user.target
```

## Verificações após publicar

```bash
curl -s https://seu-dominio/api/saude
```

Confira também:

- login com a conta criada e salvamento de uma frequência;
- cookie de sessão marcado Secure no tráfego HTTPS;
- criação e consulta de frequências pela API;
- conexão correta com o Supabase;
- ausência de logs com senhas ou connection strings.

O limitador de tentativas de login permanece em memória por instância. Em uma implantação com várias instâncias, é necessário um armazenamento compartilhado ou uma limitação no proxy.
