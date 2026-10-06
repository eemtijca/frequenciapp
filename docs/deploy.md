# Deploy

O FrequenciApp é um processo Node único com página, rotas de API e service worker. O build de produção usa `npm run build`. O banco pode ser o PostgreSQL do Compose ou uma instância gerenciada. Para AWS, Azure ou GCP com Terraform, consulte [implantacao-nuvem.md](implantacao-nuvem.md).

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

O `.env` do host usa `localhost`, para permitir executar `npm run criar-admin`, `npm run criar-coordenacao`, `npm run seed` e a suíte de API contra o banco publicado.

Ao preencher `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` no `.env`, o entrypoint cria o administrador inicial na partida. O modo de bootstrap é não destrutivo: se a conta já existir, ele não regrava a senha nem altera o nome. Para criar ou atualizar a senha explicitamente, use o comando abaixo (que sempre aplica os valores):

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

O contêiner espera o banco, aplica as migrações e inicia o servidor standalone. O migrador tenta a conexão por aproximadamente 2 minutos, com timeout de 5 segundos por tentativa e mensagens específicas para timeout, DNS, porta, credenciais e banco inexistente.

## Supabase

A configuração de produção separa o tráfego da aplicação das operações de CLI:

| Uso                                            | Variável       | Conexão Supabase                 |
| ---------------------------------------------- | -------------- | -------------------------------- |
| API Vercel e Prisma Client                     | `DATABASE_URL` | Transaction pooler, porta 6543   |
| Prisma CLI, migrations, Studio e administração | `DIRECT_URL`   | Session pooler, porta 5432       |
| Backup, restauração e rotinas SQL              | `DIRECT_URL`   | Session pooler ou conexão direta |

Exemplos de formato:

```text
DATABASE_URL=postgresql://USUARIO.PROJECT_REF:SENHA@POOLER_HOST:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_URL=postgresql://USUARIO.PROJECT_REF:SENHA@POOLER_HOST:5432/postgres?sslmode=require
```

O host, o índice e o usuário devem ser copiados do painel do Supabase. A senha precisa estar codificada para URL. A transaction pooler é indicada para funções serverless e a session pooler preserva o estado necessário para operações de migração.

O `pgbouncer=true` desativa prepared statements no Prisma Client, conforme a documentação do Supabase. O runtime usa o adaptador `pg` com pool pequeno na Vercel, inicialmente com uma conexão por instância.

Para uma role dedicada, crie um usuário PostgreSQL com permissões no schema escolhido (`public` por padrão) e use o usuário correspondente nas URLs. O papel de migração precisa criar e alterar tabelas, índices, sequences e constraints. O papel do runtime precisa de `USAGE` no schema e das permissões de leitura e escrita nos objetos da aplicação.

O `.env` local contém exemplos completos em [`.env.example`](../.env.example). O `prisma.config.ts` prioriza `DIRECT_URL` para o CLI, com fallback local para permitir geração do cliente durante o build.

Com `pg` 8.16 ou superior, `sslmode=require` passou a verificar o certificado e o pooler do Supabase pode responder `SELF_SIGNED_CERT_IN_CHAIN` nos scripts administrativos e no migrador. Nesse caso, acrescente `uselibpqcompat=true` à URL usada pelo comando, ou use `sslmode=no-verify`, para manter a criptografia sem verificação de certificado.

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

### Saída de rede

A integração opcional com o Google Planilhas exige que o servidor alcance `script.google.com` e, no redirecionamento do Content Service, `script.googleusercontent.com`. Em redes com firewall de saída, libere esses hosts; sem eles o aplicativo segue funcionando e apenas o teste de conexão e o envio falham, com mensagem clara.

### Ordem de publicação

1. provisionar o projeto Supabase e a role do aplicativo;
2. configurar `DATABASE_URL` e `DIRECT_URL` na Vercel;
3. configurar `DIRECT_URL_PROD` como segredo do GitHub;
4. aplicar as migrações pelo workflow `migracoes.yml`;
5. confirmar `npx prisma migrate status` com a conexão de sessão;
6. publicar a `main` na Vercel;
7. verificar login, frequência, histórico e `/api/saude`.

O build da Vercel não executa migrations. O workflow de CD usa `DIRECT_URL_PROD`, que deve conter a Session pooler.

### Preview em schema do mesmo banco

O Preview pode usar um schema separado no mesmo database da produção. O exemplo abaixo usa `preview`; substitua pelo nome provisionado e mantenha as variáveis no escopo **Preview** da Vercel:

```text
DATABASE_URL=postgresql://USUARIO.PROJECT_REF:SENHA@POOLER_HOST:6543/postgres?pgbouncer=true&sslmode=require&schema=preview
DIRECT_URL=postgresql://USUARIO.PROJECT_REF:SENHA@POOLER_HOST:5432/postgres?sslmode=require&schema=preview
```

As duas URLs devem indicar o mesmo database e schema, embora possam usar papéis com permissões diferentes. `USUARIO.PROJECT_REF` representa o usuário completo do pooler: copie o valor correspondente à role existente no projeto Supabase. Criar um schema não cria um usuário PostgreSQL. Sem `schema` na URL e sem `DATABASE_SCHEMA`, o destino padrão é `public`.

Em vez de repetir `schema` nas duas URLs, o escopo Preview pode definir `DATABASE_SCHEMA=preview` como variável de configuração: ela vence o parâmetro da URL e vale para o runtime, os scripts e o migrador. Use uma única forma de seleção por ambiente para evitar divergência.

O provisionamento das roles, do schema e dos default privileges está em [`scripts/provisionar-preview.sql`](../scripts/provisionar-preview.sql), que é idempotente e não toca em produção. O PostgreSQL exige membership no papel de migração para definir default privileges de outro papel (erro 42501); o script concede isso antes dos `alter default privileges`.

1. Crie o schema de Preview com uma conta administrativa do banco e conceda os privilégios necessários às roles de migração e runtime. Limite essas permissões ao ambiente correspondente.
2. Em um terminal com as variáveis do Preview, aplique `npx prisma migrate deploy` e confira `npx prisma migrate status`. Esses comandos usam `DIRECT_URL` quando definida e respeitam `DATABASE_SCHEMA`.
3. Configure `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` para uma conta de teste e execute `npm run criar-admin` com a mesma conexão de Preview. As contas da produção não são copiadas.
4. Publique novamente o Preview após salvar as variáveis na Vercel. Confirme o login e um salvamento com dados sintéticos no schema esperado.

Mantenha as variáveis do escopo Production e `DIRECT_URL_PROD` intactas. O build da Vercel apenas gera o cliente Prisma; não aplica migrações no Preview. O migrador Docker e os scripts administrativos exigem o schema existente e não usam `public` como alternativa quando o schema explícito está ausente.

Se o log apresentar `(EAUTHQUERY) user not found in the database`, confira o usuário completo do pooler, projeto, database e host configurados nas variáveis do Preview. Esse erro ocorre na autenticação PostgreSQL, antes de acessar o schema; ajustar `schema` não corrige uma role inexistente ou uma conexão de outro projeto. Não publique URLs, senhas ou valores completos das variáveis em logs ou issues.

A API trata essa falha `P2039` com a assinatura `EAUTHQUERY` como indisponibilidade: responde HTTP 503 com mensagem genérica e registra um aviso operacional estático no tratamento de erros. A conexão externa ainda precisa ser corrigida.

`/api/saude` executa `select 1`: o sucesso comprova conexão, mas não o acesso às tabelas do schema. A verificação inclui o login com a conta criada no Preview.

No escopo Preview, mantenha as cinco variáveis `GOOGLE_*` fora do ambiente. Sem elas, o servidor recusa a integração com HTTP 503 antes de qualquer chamada de rede, e o preview não alcança nenhuma planilha real. Os URIs autorizados no Google Cloud devem apontar apenas para o domínio de produção.

## GitHub Actions

Os workflows ficam em `.github/workflows/`:

| Workflow         | Responsabilidade                                             |
| ---------------- | ------------------------------------------------------------ |
| `qualidade.yml`  | Formatação, lint, tipos e testes unitários                   |
| `build.yml`      | Build de produção do Next.js                                 |
| `testes.yml`     | Compose, migração, contas de teste e contratos de API        |
| `migracoes.yml`  | `prisma migrate deploy` na `main` e no ambiente `production` |
| `codeql.yml`     | Análise de segurança de JavaScript e TypeScript              |
| `publicacao.yml` | Publicação da imagem no GHCR                                 |

Para acompanhar e operar workflows e releases pelo terminal, use o GitHub CLI (`gh`): confirme a sessão com `gh auth status` (ou `gh status`) e, se não houver conexão, rode `gh auth login`. Depois use `gh run list`, `gh run watch`, `gh run view --log-failed`, `gh pr checks --watch` e `gh release create`. Nunca inclua segredos em comandos.

O Dependabot atualiza npm, GitHub Actions e Docker semanalmente, agrupando versões minor e patch.

## VPS sem TLS (rede interna)

Quando não há proxy reverso com TLS, defina no `.env`:

```text
PERMITIR_HTTP=true
```

O cookie de sessão deixa de usar `Secure`, o HSTS não é enviado e o CSP não força upgrade. O aplicativo avisa no log. Sem TLS o tráfego fica em texto puro e o PWA não instala fora de localhost; use apenas em rede confiável e volte a `false` quando houver TLS. Detalhes em [ambiente.md](ambiente.md) e [seguranca.md](seguranca.md).

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
