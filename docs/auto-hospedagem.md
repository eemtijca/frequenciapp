# Auto-hospedagem

Guia para executar o FrequenciApp em um servidor Linux próprio, como VPS, servidor dedicado ou máquina on-premises. A aplicação continua sendo um processo Next.js com PostgreSQL 17; o repositório entrega referências de proxy, backup, agenda e atualização que podem ser substituídas.

O contrato portátil e as decisões estão na [ADR-064](adr/064-auto-hospedagem-servidor.md). O backup do banco e a restauração estão em [backup-servidor.md](backup-servidor.md).

## Contrato portátil

A aplicação exige apenas:

| Item      | Contrato                                                                        |
| --------- | ------------------------------------------------------------------------------- |
| Runtime   | Imagem OCI compatível com Docker, Podman ou Kubernetes                          |
| Banco     | PostgreSQL 17 acessível por `DATABASE_URL`                                      |
| Sessão    | `AUTH_SECRET` com pelo menos 32 caracteres                                      |
| Fuso      | `TZ_APP` com fuso IANA                                                          |
| Porta     | HTTP em `3000`                                                                  |
| Saúde     | `GET /api/saude`                                                                |
| Proxy     | HTTPS à frente, com `X-Forwarded-For`, `X-Forwarded-Proto` e `X-Forwarded-Host` |
| Migrações | `node ./docker/app/migrar.mjs` ou `prisma migrate deploy`                       |
| Agenda    | Endpoints autenticados com `CRON_SECRET`                                        |
| Backup    | `pg_dump` formato custom e `pg_restore`                                         |

Caddy, Nginx, cron, rclone, GPG e age são escolhas de referência. Outra infraestrutura pode usar o mesmo contrato sem os arquivos de `infra/servidor`.

## Pré-requisitos

- Linux com Docker Engine e Docker Compose v2.24 ou superior. A sobreposição usa `!reset`.
- `git`, `flock`, `curl`, `openssl`, `gnupg`, `age` e `rclone` no host para as rotinas de operação.
- Domínio público com registros A e AAAA, portas 80 e 443 liberadas, para TLS público.
- Ou nome interno e certificado de uma CA da escola, para TLS interno.
- Conta de implantação dedicada, com acesso ao Docker e ao checkout.
- Diretório de backup fora do volume do banco, de preferência em disco separado.

O host não precisa de Node nem pnpm para executar a aplicação. A imagem da aplicação contém o runtime e os scripts.

## Arquivos de referência

```text
compose.servidor.yml
compose.servidor-caddy.yml
compose.servidor-nginx.yml
infra/servidor/
  Caddyfile
  Caddyfile.interno
  nginx/
    Dockerfile
    docker-entrypoint.d/50-frequenciapp.sh
    frequenciapp-http.conf
    frequenciapp-https.conf
    certificados/
  backup/
    Dockerfile
  servidor.env.example
scripts/servidor/
  comum.sh
  compose.sh
  agenda.sh
  backup-banco.sh
  backup-planilhas.sh
  backup-planilhas-interno.sh
  restaurar.sh
  atualizar.sh
  renovar-certificado.sh
  instalar-rotinas.sh
```

A aplicação e o banco ficam sem portas publicadas. Apenas o proxy publica 80 e 443.

## Preparar o servidor

1. Criar a conta de implantação, por exemplo `frequenciapp`, e adicioná-la ao grupo `docker`.
2. Instalar Docker, Compose, git, cron, rclone, gnupg, age, curl e openssl.
3. Clonar o repositório em `/opt/frequenciapp`, com a conta de implantação como proprietária.
4. Criar `/etc/frequenciapp` com permissão restrita.
5. Copiar `.env.example` para `/etc/frequenciapp/app.env` e preencher os segredos da aplicação.
6. Copiar `infra/servidor/servidor.env.example` para `/etc/frequenciapp/ops.env` e ajustar a operação.
7. Proteger os dois arquivos com permissão 600 ou 640.
8. Configurar o `rclone.conf` em `/etc/frequenciapp/rclone.conf`, com permissão 600.
9. Importar a chave pública de backup ou criar a chave age.
10. Configurar o proxy e o TLS.
11. Subir a pilha e conferir a saúde.
12. Instalar o cron e testar backup e restauração.

Os arquivos de ambiente não entram no Git. O `app.env` contém `AUTH_SECRET`, credenciais do banco e opcionais do Google, push e feriados. O `ops.env` contém domínio, TLS, backup e atualização.

## Variáveis principais

### Aplicação e banco

| Variável            | Obrigatória | Uso                                             |
| ------------------- | ----------- | ----------------------------------------------- |
| `DATABASE_URL`      | sim         | Conexão de runtime                              |
| `DIRECT_URL`        | não         | Migrações e administração                       |
| `DATABASE_SCHEMA`   | não         | Schema explícito, padrão `public`               |
| `AUTH_SECRET`       | sim         | Sessões e chaves derivadas                      |
| `TZ_APP`            | não         | Fuso da escola                                  |
| `PERMITIR_HTTP`     | não         | Mantenha `false` com TLS                        |
| `POSTGRES_USER`     | não         | Usuário do Compose                              |
| `POSTGRES_PASSWORD` | não         | Senha do Compose, apenas desenvolvimento        |
| `POSTGRES_DB`       | não         | Banco do Compose                                |
| `MIGRAR_NA_PARTIDA` | não         | `true` no Compose, `false` em migração separada |
| `COMMIT_SHA`        | não         | Revisão exibida em `/api/saude`                 |

### Proxy e TLS

| Variável            | Padrão                                | Uso                                 |
| ------------------- | ------------------------------------- | ----------------------------------- |
| `PROXY_TIPO`        | `caddy`                               | `caddy` ou `nginx`                  |
| `TLS_MODO`          | `acme`                                | `acme` ou `interno`                 |
| `DOMINIO`           | vazio                                 | Nome público ou interno             |
| `ACME_EMAIL`        | vazio                                 | Contato da autoridade certificadora |
| `ACME_CA`           | Let's Encrypt                         | Diretório ACME                      |
| `PROXY_HTTP_PORTA`  | `80`                                  | Porta HTTP no host                  |
| `PROXY_HTTPS_PORTA` | `443`                                 | Porta HTTPS no host                 |
| `CADDYFILE`         | `infra/servidor/Caddyfile`            | Caddyfile público ou interno        |
| `CERTBOT_CERTS_DIR` | `./infra/servidor/nginx/certificados` | Certificados do Nginx               |

### Backup e atualização

A lista completa está em [backup-servidor.md](backup-servidor.md) e em `infra/servidor/servidor.env.example`.

## Subir com Caddy

Para TLS público:

```text
PROXY_TIPO=caddy
TLS_MODO=acme
CADDYFILE=infra/servidor/Caddyfile
DOMINIO=frequencia.exemplo.br
ACME_EMAIL=administracao@escola.exemplo.br
ACME_CA=https://acme-v02.api.letsencrypt.org/directory
```

Para TLS interno:

```text
PROXY_TIPO=caddy
TLS_MODO=interno
CADDYFILE=infra/servidor/Caddyfile.interno
DOMINIO=frequencia.escola.local
```

Subir:

```bash
scripts/servidor/compose.sh up -d --build
```

Conferir:

```bash
curl -fsS https://frequencia.exemplo.br/api/saude
scripts/servidor/compose.sh ps
```

No modo interno, exportar o certificado raiz do Caddy e instalá-lo nos dispositivos:

```bash
scripts/servidor/compose.sh cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

O arquivo `caddy-root.crt` não entra no Git. Sem a raiz confiável, o PWA não instala e o navegador mostra aviso de certificado.

## Subir com Nginx

Para TLS público:

```text
PROXY_TIPO=nginx
TLS_MODO=acme
DOMINIO=frequencia.exemplo.br
ACME_EMAIL=administracao@escola.exemplo.br
ACME_CA=https://acme-v02.api.letsencrypt.org/directory
```

Subir o Nginx no modo HTTP inicial:

```bash
scripts/servidor/compose.sh up -d --build nginx
scripts/servidor/renovar-certificado.sh --inicial
```

O script emite o certificado com Certbot, recria o Nginx e ele passa a usar a configuração HTTPS. A renovação é agendada pelo cron:

```bash
scripts/servidor/renovar-certificado.sh --dry-run
```

Para TLS interno, não usar Certbot. Colocar `fullchain.pem` e `privkey.pem` em:

```text
infra/servidor/nginx/certificados/live/frequenciapp/
```

O diretório é ignorado pelo Git. O Nginx escolhe HTTPS quando os dois arquivos existem. A renovação do certificado interno é responsabilidade da CA da escola.

## Escolher entre Caddy e Nginx

Caddy é o padrão: HTTPS automático, renovação sem cron e configuração curta. Nginx é útil quando a escola já opera Nginx ou exige Certbot e configuração TLS própria.

As duas pilhas:

- publicam apenas 80 e 443;
- aguardam a aplicação saudável;
- repassam os cabeçalhos de proxy;
- mantêm HSTS e CSP vindos da aplicação;
- usam logs com rotação do Docker.

Não execute Caddy e Nginx ao mesmo tempo. `PROXY_TIPO` escolhe uma sobreposição.

## Agenda

A agenda do servidor substitui os workflows de cinco minutos do GitHub Actions:

```bash
scripts/servidor/agenda.sh
```

O script chama:

- `/api/notificacoes/agenda`;
- `/api/planilha/fila/agenda`;
- `/api/indicadores/agenda`.

Todas as chamadas usam `Authorization: Bearer` com `CRON_SECRET`. O instalador cria a linha a cada cinco minutos. No GitHub, definir `AGENDA_EXTERNA=servidor` para desativar os workflows antigos.

## Atualização

O script `atualizar.sh` é uma referência para instalações com Compose. Ele não atualiza Kubernetes, ECS, Cloud Run, App Service ou Vercel.

Modos:

- `auto`: compila a `main` enquanto não houver tag; quando uma tag contém o commit implantado, passa a release e não volta sozinho.
- `release`: baixa a imagem do GHCR.
- `main`: compila a `main` na máquina.

Antes de aplicar:

1. A árvore Git precisa estar limpa.
2. A imagem alvo é baixada ou construída.
3. Migrações novas bloqueiam a atualização por padrão.
4. O backup do banco é executado.
5. O Compose é validado.
6. A aplicação sobe com `--wait`.
7. A saúde pública é conferida.
8. Em falha, a versão anterior é restaurada.

Uso manual:

```bash
scripts/servidor/atualizar.sh --simular
scripts/servidor/atualizar.sh
scripts/servidor/atualizar.sh --permitir-migracoes
scripts/servidor/atualizar.sh --registrar
```

A primeira instalação pode ser registrada com `--registrar` depois da subida manual. O modo `auto` usa o estado em `/var/lib/frequenciapp/estado.json`.

O Kubernetes e as plataformas gerenciadas usam o próprio rollout. O contrato da aplicação e a imagem publicada são os mesmos.

## Backup e restauração

O backup do banco usa `pg_dump`, cifra com GPG ou age, copia para um diretório local e envia por rclone. O backup das planilhas usa a rotina existente dentro de um contêiner com rclone.

Ver [backup-servidor.md](backup-servidor.md) para:

- modos `compose` e `url`;
- chaves GPG e age;
- configuração do rclone;
- retenção local;
- verificação remota;
- restauração;
- inventário de chaves;
- ensaio periódico.

## Cron e logrotate

Instalar as rotinas como root:

```bash
sudo scripts/servidor/instalar-rotinas.sh
```

O instalador grava:

- `/etc/cron.d/frequenciapp`;
- `/etc/logrotate.d/frequenciapp`;
- diretórios de estado, backup e log com o proprietário da conta de implantação.

Horários configuráveis:

```text
AGENDA_HORARIO=*/5 * * * *
BACKUP_HORARIO=30 2 * * *
BACKUP_PLANILHAS_HORARIO=0 3 * * *
ATUALIZAR_HORARIO=30 4 * * *
CERTBOT_RENOVAR_HORARIO=15 2 * * *
```

O cron usa o fuso do sistema ou `CRON_TZ`. O fuso da aplicação continua em `TZ_APP`.

## Monitoramento

- Monitorar `https://dominio/api/saude` de fora da máquina.
- Acompanhar falhas do cron por `MAILTO` ou pelo webhook `NOTIFICAR_URL`.
- Conferir `ultimo-backup.json` e `estado.json` em `/var/lib/frequenciapp`.
- Alertar quando o backup mais recente tiver mais de 24 horas.
- Alertar quando o certificado estiver próximo do vencimento.
- Monitorar espaço em disco do banco, dos logs e do backup.
- Revisar a agenda do GitHub quando ela for usada na nuvem.

## Segurança

- Manter `PERMITIR_HTTP=false` com TLS.
- Não publicar as portas 3000 e 5432.
- Proteger `app.env`, `ops.env` e `rclone.conf` com permissão 600 ou 640.
- Guardar a chave privada GPG ou age fora do servidor.
- Não usar a senha padrão `frequencia` em produção.
- Executar o backup com a conta de implantação, não como root.
- Manter o Docker e o sistema atualizados.
- Revisar acessos ao grupo `docker`, que equivale a privilégio de root.
- Ativar firewall com apenas 22, 80 e 443 abertos.
- Usar autenticação por chave SSH e desativar login de senha.
- Testar a restauração periodicamente.

## Diagnóstico

### Certificado não emitido

- Conferir DNS e propagação.
- Conferir portas 80 e 443 no firewall e no provedor.
- Conferir CAA do domínio.
- Conferir se o provedor de CDN está encaminhando o desafio HTTP.
- Ver logs: `scripts/servidor/compose.sh logs caddy` ou `scripts/servidor/compose.sh logs nginx`.
- Testar com a AC de staging antes da produção.

### Aplicação com 502

- Conferir `scripts/servidor/compose.sh ps`.
- Conferir `curl -fsS http://127.0.0.1:3000/api/saude` dentro da rede.
- Conferir logs da aplicação e do banco.
- Conferir se `PERMITIR_HTTP` está `false` e se o proxy envia `X-Forwarded-Proto`.

### Banco não aceita conexão

- Conferir `POSTGRES_PASSWORD` e a codificação da URL.
- Confirmar que o volume `pgdata` existe.
- Confirmar que a aplicação está na rede `interna`.
- Conferir `scripts/servidor/compose.sh logs db`.

### Back-up falhou

- Conferir permissões de `rclone.conf`.
- Conferir a chave pública GPG ou o arquivo de destinatários age.
- Conferir espaço em disco.
- Conferir se a origem e o destino do rclone estão acessíveis.
- Conferir mensagens do cron e `ultimo-backup.json`.

### Atualização bloqueada

- Árvore Git com alterações locais.
- Migrações novas sem `--permitir-migracoes`.
- Falha anterior registrada em `falha.json`.
- Imagem alvo indisponível no registro.
- Espaço insuficiente para build.

## Referências

- [ADR-064](adr/064-auto-hospedagem-servidor.md)
- [Backup do servidor](backup-servidor.md)
- [Operação](operacao.md)
- [Ambiente](ambiente.md)
- [Segurança](seguranca.md)
- [Caddy: HTTPS automático](https://caddyserver.com/docs/automatic-https)
- [Caddy: opções globais](https://caddyserver.com/docs/caddyfile/options)
- [Nginx: imagem oficial](https://hub.docker.com/_/nginx)
- [Certbot: imagem oficial](https://hub.docker.com/r/certbot/certbot)
