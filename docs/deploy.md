# Deploy

O FrequenciApp é um processo Node único com página, rotas de API e service worker. O build de produção usa `pnpm run build`. O banco pode ser o PostgreSQL do Compose ou uma instância gerenciada. Para AWS, Azure ou GCP com Terraform, consulte [implantacao-nuvem.md](implantacao-nuvem.md).

## Migração do calendário letivo

Antes de publicar a versão com feriados, aplicar `20261010124500_calendario_feriados` no banco ou schema do ambiente de destino, usando `pnpm exec prisma migrate deploy` com a `DIRECT_URL` já configurada. A migração cria a tabela do calendário, com data, nome e autoria, sem mudar chamadas existentes. Gerar o cliente Prisma ou concluir o build da Vercel não aplica essa migração. Na produção, conferir a execução do workflow de migrações antes de servir a nova versão; cada Preview também precisa estar migrado em seu próprio schema.

A sincronização com a base de feriados exige também `20261010183000_origem_feriado`. Essa migração acrescenta a origem do feriado, com padrão manual, sem alterar chamadas nem datas já cadastradas. `FERIADOS_API_TOKEN` é opcional e fica somente no servidor. Sem o token, o botão de sincronização permanece desligado.

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

O banco é publicado só no loopback do host (`127.0.0.1:5432`), porque usa a senha fixa do Compose; não o exponha na rede. O `.env` do host usa `localhost`, para permitir executar `pnpm run criar-admin`, `pnpm run criar-coordenacao`, `pnpm run seed` e a suíte de API contra o banco publicado.

Ao preencher `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` no `.env`, o entrypoint cria o administrador inicial na partida. O modo de bootstrap é não destrutivo: se a conta já existir, ele não regrava a senha nem altera o nome. Para criar ou atualizar a senha explicitamente, use o comando abaixo (que sempre aplica os valores):

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' \
  docker compose exec app pnpm run criar-admin
SEED_ALUNOS=12 docker compose exec app pnpm run seed
```

O restante da configuração é feito pela área de Gestão do aplicativo.

Para testar com um projeto isolado, sem destruir um volume local existente:

```bash
docker compose -p frequenciapp-test up --build -d
curl -fsS http://localhost:3000/api/saude
docker compose -p frequenciapp-test down -v --remove-orphans
```

Se a migration inicial for recriada durante o desenvolvimento, bancos antigos precisam ser removidos ou recriados. O comando `pnpm exec prisma migrate reset --force` também serve para um ambiente local descartável.

## Servidor auto-hospedado

O repositório inclui referências para VPS, servidor dedicado e máquina on-premises, com Caddy ou Nginx, TLS público ou interno, backup do banco e atualização por cron. O guia está em [auto-hospedagem.md](auto-hospedagem.md) e o backup em [backup-servidor.md](backup-servidor.md).

A aplicação e o banco não publicam portas no host. Apenas o proxy publica 80 e 443. As migrações continuam no entrypoint por padrão; em plataformas que rodam a migração em Job separado, usar `MIGRAR_NA_PARTIDA=false` e executar `node ./docker/app/migrar.mjs` antes da aplicação.

O backup do banco usa `pg_dump`, GPG ou age, rclone e verificação por download. O backup das planilhas usa a rotina existente em um contêiner com rclone. As duas rotinas são independentes.

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

Com `pg` 8.16 ou superior, `sslmode=require` passou a verificar o certificado e o pooler do Supabase pode falhar com `SELF_SIGNED_CERT_IN_CHAIN` no runtime, nos scripts administrativos e no migrador. Nesse caso, acrescente `uselibpqcompat=true` à URL do ambiente afetado, ou use `sslmode=no-verify`, para manter a criptografia sem verificação de certificado; o runtime registra a falha `P1011` como indisponibilidade amigável.

## Vercel

A integração nativa de Git da Vercel é um ator externo cuja configuração real precisa de confirmação e coordenação antes de habilitar a orquestração. O arquivo `vercel.json` define:

- framework `nextjs`;
- `pnpm install --frozen-lockfile` como instalação;
- `pnpm run vercel-build` como build;
- saída `.next`;
- URLs limpas e cabeçalhos de segurança.

Configure no projeto Vercel, para produção e previews:

- `DATABASE_URL` com a Transaction pooler do Supabase;
- `DIRECT_URL` com a Session pooler, necessária durante o build e para operações de CLI;
- `AUTH_SECRET` com pelo menos 32 caracteres;
- `TZ_APP`, opcionalmente `America/Fortaleza`;
- `POOL_MAX_CONEXOES=3` (de 3 a 5) para o pool por instância serverless; hosts persistentes usam o padrão 10.

Não defina a senha do Supabase no repositório. Use as configurações de ambiente da Vercel.

### Saída de rede

A integração opcional com o Google Planilhas exige que o servidor alcance `script.google.com` e, no redirecionamento do Content Service, `script.googleusercontent.com`. Em redes com firewall de saída, libere esses hosts; sem eles o aplicativo segue funcionando e apenas o teste de conexão e o envio falham, com mensagem clara.

### Ordem de publicação

`implantacao.yml` é o proprietário único de validar/buildar, migrar, publicar sem domínio, promover e verificar saúde por SHA. `migracoes.yml` delega essa sequência. A `main` é aceita em cada commit; tags estáveis também são aceitas. O auto-deploy nativo da `main` fica desligado no `vercel.json` e no painel da Vercel, para o workflow ser o único caminho de produção. `DIRECT_URL_PROD` é entregue somente ao processo migrador pelo adaptador. A CLI Vercel vem do lock, sem `dlx` ou `latest`. Com `DEPLOY_TARGET` diferente de vazio ou `vercel`, a sequência de produção é ignorada e o servidor próprio segue o guia de auto-hospedagem.

`publicacao.yml` valida versão, tag e commit antes do login no GHCR, lê o inventário de releases e mantém `latest` monotônico. Uma imagem antiga republicada mantém a própria versão e `sha-<SHA>`, sem mover o canal estável para trás. O comando manual precisa ser executado na tag `vX.Y.Z`; a branch de mesmo nome é recusada.

O fluxo da Vercel não usa `IMPLANTACAO_ATESTADO`. A sequência aplica a migração antes de publicar e a recuperação depende do backup da plataforma. A auto-hospedagem mantém o backup obrigatório em `scripts/servidor/atualizar.sh` e o hook `backup-gate` do Kubernetes. Falha posterior à entrada em migração pode deixar schema aplicado; não é rollback de banco. Detalhes em [releases.md](releases.md).

### Preview e manutenção

`schema-preview.yml` valida PRs sem segredos de banco, sem credenciais de plataforma e sem provisionar schemas. Preparo automático e redeploy de PR ficam suspensos até o aceite de uma topologia própria para executar migrações não confiáveis. Branch interna não equivale a código revisado.

A manutenção do banco existente fica em `schema-preview-confiavel.yml`, por dispatch na `main`, com revisão completa em `PREVIEW_TRUSTED_SHA` e gate `PREVIEW_MANUTENCAO_APROVADA`. O SHA precisa ter 40 hexadecimais e ser ancestral de `origin/main`, conferido por `git fetch` e `git merge-base --is-ancestor` antes do checkout e do uso de `DIRECT_URL_PREVIEW`. O environment `preview`, suas aprovações e os grants precisam ser confirmados pelo mantenedor; não foram alterados nesta proposta. A manutenção aceita fallback, limpeza numérica e faxina, nunca artefatos ou migrações de PR não revisadas.

Na faxina, todas as páginas de PRs abertos são validadas antes de calcular órfãos e iniciar DROP. A consulta usa origem fixa e não segue Link ou redirects com token. Resposta parcial, inválida ou repetida aborta sem remoções. Só nomes `preview_pr_<inteiro positivo>` são candidatos; a API é viva e não fornece snapshot transacional.

A proposta de banco descartável dedicado por preview ainda exige aceite de topologia, custo, retenção e operação. O provisionador legado e os grants reais não foram remediados por hipótese. A caracterização sintética de PUBLIC, funções, tipos, sequences e membership pertence ao executor de isolamento da issue #423-C e não foi executada nesta frente. A [ADR-038](adr/038-automacao-do-schema-de-preview.md) distingue esses estados.

Sem `DATABASE_SCHEMA` ou parâmetro de schema, o runtime usa `public`. A escolha de schema não cria login nem comprova privilégio. `/api/saude` comprova conexão e revisão, não DML sobre tabelas; o aceite inclui operação sintética de login e salvamento. Não configurar variáveis `GOOGLE_*` ou credenciais reais em ensaios de preview.

## GitHub Actions

Os workflows ficam em `.github/workflows/`:

| Workflow             | Responsabilidade                                                     |
| -------------------- | -------------------------------------------------------------------- |
| `qualidade.yml`      | Formatação, lint, tipos e testes unitários                           |
| `build.yml`          | Build de produção do Next.js                                         |
| `testes.yml`         | Compose, migração, contas de teste e contratos de API                |
| `migracoes.yml`      | Delegação manual para a sequência completa em `implantacao.yml`      |
| `schema-preview.yml` | Validação sem segredos; manutenção privilegiada em workflow separado |
| `codeql.yml`         | Análise de segurança de JavaScript e TypeScript                      |
| `publicacao.yml`     | Publicação da imagem no GHCR                                         |
| `servidor.yml`       | Validação de Compose, Caddy, Nginx, scripts e workflows de servidor  |

### Automação opcional por variável

Os workflows de operação continuam disponíveis para nuvem e podem ser desativados numa instalação auto-hospedada:

| Variável                  | Efeito                                                  |
| ------------------------- | ------------------------------------------------------- |
| `DEPLOY_TARGET=servidor`  | Ignora deploy, migração de produção e preview de Vercel |
| `AGENDA_EXTERNA=servidor` | Ignora as agendas de notificações e fila no GitHub      |
| `BACKUP_EXTERNO=servidor` | Ignora o backup externo de planilhas no GitHub          |

Sem as variáveis, o comportamento anterior é preservado. Os valores podem ser definidos com `gh variable set DEPLOY_TARGET --body servidor`.

Para acompanhar e operar workflows e releases pelo terminal, use o GitHub CLI (`gh`): confirme a sessão com `gh auth status` (ou `gh status`) e, se não houver conexão, rode `gh auth login`. Depois use `gh run list`, `gh run watch`, `gh run view --log-failed`, `gh pr checks --watch` e `gh release create`. Nunca inclua segredos em comandos.

O Dependabot atualiza as dependências (ecossistema npm, com `pnpm-lock.yaml`), o GitHub Actions e o Docker semanalmente, agrupando versões minor e patch.

A publicação de release gera imagens `linux/amd64` e `linux/arm64` para a aplicação e para `frequenciapp-backup`. A imagem de backup deriva da aplicação e acrescenta PostgreSQL 17, rclone, GPG e age.

## VPS sem TLS (rede interna)

Para a referência completa com proxy e TLS, consultar [auto-hospedagem.md](auto-hospedagem.md). Quando não há proxy reverso com TLS, defina no `.env`:

```text
PERMITIR_HTTP=true
```

O cookie de sessão deixa de usar `Secure`, o HSTS não é enviado e o CSP não força upgrade. O aplicativo avisa no log. Sem TLS o tráfego fica em texto puro e o PWA não instala fora de localhost; use apenas em rede confiável e volte a `false` quando houver TLS. Detalhes em [ambiente.md](ambiente.md) e [seguranca.md](seguranca.md).

## Máquina própria com systemd

Build e execução diretos:

```bash
pnpm install --frozen-lockfile
pnpm run build
DATABASE_URL=... DIRECT_URL=... AUTH_SECRET=... pnpm start
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
ExecStart=/usr/bin/pnpm start
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
