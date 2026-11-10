# Auto-hospedagem

Guia para executar o FrequenciApp em um servidor Linux próprio, como VPS, servidor dedicado ou máquina on-premises. A aplicação continua sendo um processo Next.js com PostgreSQL 17; o repositório entrega referências de proxy, backup, agenda e atualização que podem ser substituídas.

O contrato portátil e as decisões estão na [ADR-064](adr/064-auto-hospedagem-servidor.md) e na [ADR-065](adr/065-atualizacao-e-recuperacao-verificaveis.md). O backup do banco e a restauração estão em [backup-servidor.md](backup-servidor.md). Para Kubernetes, consultar [kubernetes.md](kubernetes.md).

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

- Linux com utilitários GNU, Bash 4 ou superior, Docker Engine e Docker Compose v2.24 ou superior. A sobreposição usa `!reset`.
- `git`, `flock`, `curl`, `openssl`, `gnupg`, `age`, `rclone`, `sha256sum`, `node` e `jq` no host para as rotinas de operação.
- `pg_restore` 17 e `psql` no host apenas para o modo de backup e restauração por URL. No modo Compose, o cliente roda dentro do contêiner do banco.
- Cron compatível com o fuso do daemon. O cronie do RHEL e derivados aceita `CRON_TZ`; o cron do Debian e do Ubuntu não aceita. O instalador confere essa condição.
- Domínio público com registros A e AAAA, portas 80 e 443 liberadas, para TLS público.
- Ou nome interno e certificado de uma CA da escola, para TLS interno.
- Conta de implantação dedicada, com acesso ao Docker e ao checkout.
- Diretório de backup fora do volume do banco, de preferência em disco separado.
- Espaço para a worktree de build e, na restauração Compose, para o banco anterior mantido durante a conferência.

Sistemas testados: Linux com Docker Compose v2.24 ou superior. O script não substitui runtime de Kubernetes, ECS, Cloud Run, App Service ou Vercel.

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
  identidade.sh
  identidade.mjs
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
11. Conferir a identidade inicial com `scripts/servidor/identidade.sh --iniciar`.
12. Subir a pilha e conferir a saúde.
13. Adotar a identidade com `scripts/servidor/identidade.sh --adotar --confirmar`.
14. Instalar o cron e testar backup e restauração.

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

### Instalação Compose e serviços

| Variável                            | Padrão                                 | Uso                                     |
| ----------------------------------- | -------------------------------------- | --------------------------------------- |
| `COMPOSE_PROJECT_NAME`              | obrigatório                            | Nome explícito do projeto Compose       |
| `SERVIDOR_IDENTIDADE_ARQUIVO`       | `$SERVIDOR_CONFIG_DIR/identidade.json` | Registro privado da identidade adotada  |
| `SERVIDOR_LOCK_DIR`                 | `/var/lock/frequenciapp`               | Diretório 0700 das travas por projeto   |
| `COMPOSE_ARQUIVOS`                  | arquivos de referência                 | Lista separada por `:`                  |
| `SERVIDOR_SERVICO_APP`              | `app`                                  | Serviço da aplicação                    |
| `SERVIDOR_SERVICO_DB`               | `db`                                   | Serviço do banco                        |
| `SERVIDOR_SERVICO_PROXY`            | `caddy` ou `nginx`                     | Serviço do proxy                        |
| `SERVIDOR_SERVICO_BACKUP_PLANILHAS` | `backup-planilhas`                     | Serviço opcional de backup de planilhas |

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

O script emite o certificado com Certbot, recria o Nginx e ele passa a usar a configuração HTTPS. A porta 80 continua atendendo ao desafio HTTP-01 e redireciona as demais requisições para HTTPS. A renovação é agendada pelo cron:

```bash
scripts/servidor/renovar-certificado.sh --dry-run
```

Para TLS interno, não usar Certbot. Colocar `fullchain.pem` e `privkey.pem` em:

```text
infra/servidor/nginx/certificados/live/frequenciapp/
```

O diretório padrão é ignorado pelo Git e pelos contextos de build. Para outro `CERTBOT_CERTS_DIR`, prefira um diretório absoluto fora do checkout e dos contextos de build; as regras de exclusão cobrem nomes e extensões comuns, não todos os possíveis segredos. O Nginx escolhe HTTPS quando os dois arquivos existem. A renovação do certificado interno é responsabilidade da CA da escola.

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

Todas as chamadas usam `Authorization: Bearer` com `CRON_SECRET`. O instalador cria a linha a cada cinco minutos.

Cada rotina pode ser desligada de forma independente:

```text
AGENDA_URL=http://127.0.0.1:3000
AGENDA_TIMEOUT=300
AGENDA_NOTIFICACOES=true
AGENDA_PLANILHAS=true
AGENDA_INDICADORES=true
```

Os seletores aceitam apenas `true` ou `false`; ausência conserva `true` e qualquer outro valor encerra antes das chamadas. `AGENDA_TIMEOUT` é um inteiro positivo de até 2147483 segundos, aplicado a cada requisição. Uma falha ou timeout em uma rotina não impede as seguintes, e todas desligadas encerram sem exigir `CRON_SECRET`. O wrapper passa URL, timeout e seletores por `compose exec -e` ao serviço de aplicação configurado. Desligar uma função não remove dados nem itens de fila, e o backup de planilhas tem controle separado.

## Desativar a automação do GitHub

A instalação auto-hospedada pode desativar os workflows de operação sem removê-los:

```text
DEPLOY_TARGET=servidor
AGENDA_EXTERNA=servidor
BACKUP_EXTERNO=servidor
```

- `DEPLOY_TARGET=servidor` ignora deploy, migração de produção e preview de Vercel.
- `AGENDA_EXTERNA=servidor` ignora notificações e fila no GitHub.
- `BACKUP_EXTERNO=servidor` ignora o backup externo de planilhas no GitHub.

Sem as variáveis, o comportamento anterior é preservado para Vercel, AWS, Azure e GCP. Os valores podem ser definidos com `gh variable set`.

## Atualização

O script `atualizar.sh` é uma referência para instalações com Compose. Ele não atualiza Kubernetes, ECS, Cloud Run, App Service ou Vercel.

Modos:

- `auto`: compila a `main` enquanto não houver tag; quando uma tag contém o commit implantado, passa a release e não volta sozinho.
- `release`: baixa a imagem do GHCR.
- `main`: compila o commit alvo em uma worktree isolada na máquina.

Antes de aplicar:

1. O Compose é montado e validado com `docker compose config --quiet`.
2. A árvore Git precisa estar limpa e o estado registrado precisa corresponder ao checkout.
3. Migrações novas bloqueiam a atualização por padrão. Com `MIGRAR_NA_PARTIDA=false`, a atualização também recusa até `ATUALIZAR_MIGRACAO_EXTERNA=true` confirmar que a migração foi aplicada fora do entrypoint.
4. O backup do banco é obrigatório e o estado recém-gravado é conferido. A atualização exige confirmação remota, salvo `ATUALIZAR_PERMITIR_BACKUP_LOCAL=true` com decisão explícita.
5. A imagem alvo é baixada ou construída na worktree do commit alvo.
6. O rótulo OCI da imagem é comparado com o commit alvo.
7. A configuração do Compose do alvo é validada antes de alterar o checkout principal.
8. A aplicação sobe com `--wait` e a saúde pública é conferida quando configurada.
9. Em falha, a imagem e o commit anteriores são restaurados.

O backup de planilhas é opcional. Quando `BACKUP_PLANILHAS_HABILITADO=false`, a imagem `backup-planilhas` não é baixada nem construída.

A atualização automática pelo cron não é instalada por padrão. `ATUALIZAR_HABILITADO=false` mantém a rotina fora do cron; defina `true` somente depois de revisar a agenda e o rollback.

`ATUALIZAR_VERIFICAR_IMAGEM=true` confere o rótulo da imagem antes da aplicação. `ATUALIZAR_BACKUP_ANTES=false` é rejeitado porque o backup anterior é obrigatório.

Quando o healthcheck usa HTTPS com CA interna, defina `ATUALIZAR_SAUDE_CA` e `RESTAURAR_SAUDE_CA` com o caminho do certificado. Sem a CA, o `curl` usa o repositório do sistema.

O rollback da imagem e do commit não desfaz uma migração já aplicada. Em caso de falha após uma migração, use o backup gerado antes da atualização e o procedimento de restauração. O arquivo `falha.json` registra se havia migrações novas.

A restauração e o backup de planilhas usam `imagem` e `imagemBackup` de `estado.json` quando o processo não recebe `APP_IMAGEM` ou `APP_IMAGEM_BACKUP` explicitamente. O estado gravado pelo último update evita voltar para a imagem local inicial.

A restauração recusa um dump cujo histórico de migrações não seja um prefixo do checkout. `RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=true` só deve ser usado em uma decisão explícita e controlada.

Uso manual:

```bash
scripts/servidor/atualizar.sh --simular
scripts/servidor/atualizar.sh
scripts/servidor/atualizar.sh --permitir-migracoes
scripts/servidor/atualizar.sh --registrar
```

A simulação não executa `git fetch`, não altera refs nem tags e não aplica backup, build ou migração. Ela usa as referências locais; para considerar o remoto mais recente, execute `git fetch` manualmente e repita a simulação.

A primeira instalação pode ser registrada com `--registrar` depois da subida manual e da adoção da identidade. O modo `auto` usa o estado em `/var/lib/frequenciapp/estado.json`.

O Kubernetes e as plataformas gerenciadas usam o próprio rollout. O contrato da aplicação e a imagem publicada são os mesmos.

## Backup e restauração

O backup do banco usa `pg_dump`, cifra em fluxo com GPG ou age, copia para um diretório local e envia por rclone. A cópia remota é comparada com o hash local e a retenção preserva um mínimo configurável de cópias confirmadas. O backup das planilhas usa a rotina existente dentro de um contêiner com rclone.

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
AGENDA_HORARIO='*/5 * * * *'
BACKUP_HORARIO='30 2 * * *'
BACKUP_PLANILHAS_HORARIO='0 3 * * *'
ATUALIZAR_HORARIO='30 4 * * *'
CERTBOT_RENOVAR_HORARIO='15 2 * * *'
```

No arquivo `ops.env`, mantenha as aspas nos valores com espaços. Corrija os horários sem aspas em instalações existentes antes de carregar as rotinas.

O cron agenda no fuso do daemon. O fuso da aplicação continua em `TZ_APP`.

- O instalador compara o fuso do daemon com `TZ_APP` e recusa a instalação quando os dois diferem sem suporte comprovado a `CRON_TZ`.
- `CRON_TZ` só deve ser definido em implementações que o respeitam, como o cronie do RHEL e derivados. O cron do Debian e do Ubuntu não respeita `CRON_TZ` e usa o fuso do daemon.
- Para manter o horário esperado no Debian ou no Ubuntu, ajuste o fuso do sistema com `timedatectl set-timezone America/Fortaleza`, usando o fuso IANA da escola.
- O modelo `infra/servidor/cron/servidor.template` é a fonte das linhas instaladas. Caminhos com espaços são citados.

## Kubernetes

O chart Helm aceita `agenda.timeZone`, `agenda.timeoutSeconds`, `backup.database.timeZone` e `backup.spreadsheets.timeZone`. A agenda tem seletores próprios para notificações, planilhas e indicadores. O campo `timeZone` dos CronJobs exige Kubernetes 1.27 ou superior. Sem o valor, o agendador usa o fuso do cluster. O backup do banco exige PVC ou destino remoto explícito, e o gate de upgrade continua exigindo o recibo no PVC; o detalhamento está em [kubernetes.md](kubernetes.md).

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

## Identidade operacional

As rotinas exigem Node.js e `jq` no host. O `COMPOSE_PROJECT_NAME` é obrigatório e deve ser definido em `/etc/frequenciapp/ops.env`; sem ele, as rotinas recusam a operação. A identidade reúne o ID do daemon, o projeto, os serviços `app` e `db`, os labels do Compose e as montagens persistentes do banco.

O fluxo tem dois modos:

1. Antes da primeira subida, o modo inicial confere projeto, daemon, serviços e volumes declarados sem exigir containers:

   ```bash
   scripts/servidor/identidade.sh --iniciar
   ```

2. Depois da subida e antes de backup, restauração, atualização, agenda ou cron, a adoção grava a identidade dos recursos existentes:

   ```bash
   scripts/servidor/identidade.sh --adotar --confirmar
   ```

O arquivo `SERVIDOR_IDENTIDADE_ARQUIVO`, padrão `/etc/frequenciapp/identidade.json`, guarda a identidade adotada com modo 600. Ele não é sobrescrito automaticamente. Divergência de projeto, daemon, serviço ou montagem é recusada; a correção exige revisão manual do registro. O modo `scripts/servidor/identidade.sh --conferir` apenas compara o registro com os recursos atuais.

A trava deriva da chave da identidade. Operações do mesmo projeto são serializadas, inclusive backup, restauração, atualização, agenda e cron. Projetos independentes usam arquivos de trava diferentes e progridem em paralelo. No modo URL, sem identidade de projeto verificável, backup e restauração usam uma trava conservadora compartilhada entre operações de URL. `SERVIDOR_LOCK_DIR` deve pertencer ao operador e ter modo 0700. O descritor 9 pode ser herdado por um processo filho legítimo, e a revalidação confere se ele aponta para a trava do mesmo projeto. A trava é local ao host, não distribuída.

A atualização só aceita backup remoto confirmado quando `verificadoRemoto` é o booleano `true`. `false`, campo ausente, texto, nulo ou JSON truncado bloqueiam a atualização.

## Referências

- [ADR-064](adr/064-auto-hospedagem-servidor.md)
- [ADR-071](adr/071-agendas-independentes-e-timeout.md)
- [Backup do servidor](backup-servidor.md)
- [Operação](operacao.md)
- [Ambiente](ambiente.md)
- [Segurança](seguranca.md)
- [Caddy: HTTPS automático](https://caddyserver.com/docs/automatic-https)
- [Caddy: opções globais](https://caddyserver.com/docs/caddyfile/options)
- [Nginx: imagem oficial](https://hub.docker.com/_/nginx)
- [Certbot: imagem oficial](https://hub.docker.com/r/certbot/certbot)
