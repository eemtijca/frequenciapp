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
- Domínio público com registros DNS adequados, ou IPv4 público roteável com Caddy, e portas 80 e 443 liberadas, para TLS público.
- Ou nome interno e certificado de uma CA da escola, para TLS interno.
- Conta de implantação dedicada, com acesso ao Docker e ao checkout.
- Diretório de backup fora do volume do banco, de preferência em disco separado.
- Espaço para a worktree de build e, na restauração Compose, para o banco anterior mantido durante a conferência.

Sistemas testados: Linux com Docker Compose v2.24 ou superior. O script não substitui runtime de Kubernetes, ECS, Cloud Run, App Service ou Vercel.

O host não precisa de Node nem pnpm para executar a aplicação. A imagem da aplicação contém o runtime e os scripts.

## Instalador e perfis

O `instalar.sh` é o caminho recomendado para preparar o host. Ele segue o contrato de [instalador.md](instalador.md), com `planejar`, `aplicar`, `situacao`, `diagnosticar`, `atualizar`, `backup`, `restaurar`, `desinstalar` e `canal`.

| Perfil        | Requisitos                                                                | Rotinas                                               |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `simples`     | Docker, nome DNS ou IPv4 público e contas iniciais                        | systemd timers ou cron                                |
| `controlador` | `--operador-controlador` com conta sem privilégio e identidade já adotada | cron estável em `/etc/cron.d/frequenciapp`            |
| `dropbox`     | Adoção, token, `rclone.conf` e destino Dropbox iguais à pasta adotada     | systemd timers ou cron; backup com verificação nativa |
| `completo`    | Requisitos do controlador e do Dropbox                                    | cron estável e backup Dropbox                         |

O perfil simples é o padrão. Os demais são opt-in e não podem bloquear o caminho simples. A troca de canal está em [instalador.md](instalador.md#canal-release-e-main). O controlador e a readoção estão em [controlador-manutencao.md](controlador-manutencao.md). O Dropbox, o token e a retenção estão em [dropbox-retencao.md](dropbox-retencao.md).

## Arquivos de referência

```text
compose.servidor.yml
compose.servidor-caddy.yml
compose.servidor-nginx.yml
compose.observabilidade.yml
infra/servidor/
  Caddyfile
  Caddyfile.ipv4
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
infra/observabilidade/
  prometheus/
    prometheus.yml
    regras.yml
    regras.test.yml
    entrypoint.sh
  blackbox/
    blackbox.yml
    entrypoint.sh
  alertmanager/
    alertmanager.yml
    entrypoint.sh
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

A aplicação e o banco ficam sem portas publicadas. Apenas o proxy publica 80 e 443. Com a observabilidade ligada, a ponte do painel publica 9090 somente no loopback do host, pelas redes `interna` e `painel`, sem `publica`. O Prometheus, o node exporter, o blackbox exporter e o Alertmanager não publicam porta alguma, e nenhum outro serviço entra na rede `painel`.

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

Os arquivos de ambiente não entram no Git. O `app.env` contém `AUTH_SECRET`, credenciais do banco e opcionais do Google, push, feriados e o token de métricas. O `ops.env` contém domínio, TLS, backup, atualização e observabilidade.

## Variáveis principais

### Aplicação e banco

| Variável            | Obrigatória | Uso                                                               |
| ------------------- | ----------- | ----------------------------------------------------------------- |
| `DATABASE_URL`      | sim         | Conexão de runtime                                                |
| `DIRECT_URL`        | não         | Migrações e administração                                         |
| `DATABASE_SCHEMA`   | não         | Schema explícito, padrão `public`                                 |
| `AUTH_SECRET`       | sim         | Sessões e chaves derivadas                                        |
| `TZ_APP`            | não         | Fuso da escola                                                    |
| `PERMITIR_HTTP`     | não         | Mantenha `false` com TLS                                          |
| `POSTGRES_USER`     | não         | Usuário do Compose                                                |
| `POSTGRES_PASSWORD` | não         | Senha do Compose, apenas desenvolvimento                          |
| `POSTGRES_DB`       | não         | Banco do Compose                                                  |
| `MIGRAR_NA_PARTIDA` | não         | `true` no Compose, `false` em migração separada                   |
| `COMMIT_SHA`        | não         | Revisão exibida em `/api/saude`                                   |
| `METRICAS_TOKEN`    | não         | Token da coleta Prometheus; sem ele, `/api/metricas` responde 404 |

### Observabilidade

A coleta e o painel são opcionais e não sobem em instalações existentes sem decisão explícita. O guia completo está em [observabilidade.md](observabilidade.md).

| Variável                     | Padrão                                             | Uso                                                      |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `OBSERVABILIDADE_HABILITADA` | `false` em instalações existentes, `true` em novas | Inclui `compose.observabilidade.yml` no projeto Compose. |
| `PROMETHEUS_PORTA`           | `9090`                                             | Porta do painel no loopback do host.                     |
| `ALERTA_WEBHOOK_URL`         | vazio                                              | Receptor webhook do Alertmanager. Segredo.               |
| `ALERTA_WEBHOOK_TOKEN`       | vazio                                              | Token Bearer opcional do webhook. Segredo.               |
| `ALERTA_EMAIL_PARA`          | vazio                                              | Destinatário do receptor de e-mail.                      |
| `ALERTA_EMAIL_DE`            | vazio                                              | Remetente do receptor de e-mail.                         |
| `ALERTA_SMTP_SMARTHOST`      | vazio                                              | Servidor SMTP no formato `host:porta`.                   |
| `ALERTA_SMTP_USUARIO`        | vazio                                              | Usuário de autenticação do SMTP.                         |
| `ALERTA_SMTP_SENHA`          | vazio                                              | Senha de autenticação do SMTP. Segredo.                  |

O node exporter e o blackbox exporter sobem com a observabilidade. O Alertmanager é opt-in pelo perfil Compose `alertas` e aceita apenas um receptor por vez: o webhook ou o conjunto completo de e-mail. As variáveis `ALERTA_*` ficam no `ops.env`, e o webhook, o token opcional e a senha SMTP são segredos. O entrypoint grava esses valores em arquivos com modo 600 em `/tmp` e usa os campos nativos `url_file`, `http_config.authorization.credentials_file` e `smtp_auth_password_file`, sem segredo em argumento de processo. O detalhamento está em [observabilidade.md](observabilidade.md#segredos-e-conteúdo-dos-alertas).

Com `COMPOSE_ARQUIVOS` definida, a lista é autoritativa. Com `OBSERVABILIDADE_HABILITADA=true`, `compose.observabilidade.yml` precisa estar citado nela, ou a operação é recusada antes de qualquer mutação. Com a flag desligada, citar o overlay mantém uma escolha explícita revisada. Sem `COMPOSE_ARQUIVOS`, a lista padrão inclui o overlay quando a flag está ligada.

### Proxy e TLS

| Variável            | Padrão                                | Uso                                 |
| ------------------- | ------------------------------------- | ----------------------------------- |
| `PROXY_TIPO`        | `caddy`                               | `caddy` ou `nginx`                  |
| `TLS_MODO`          | `acme`                                | `acme` ou `interno`                 |
| `DOMINIO`           | vazio                                 | Nome público, interno ou IPv4       |
| `ACME_EMAIL`        | vazio                                 | Contato da autoridade certificadora |
| `ACME_CA`           | Let's Encrypt                         | Diretório ACME                      |
| `PROXY_HTTP_PORTA`  | `80`                                  | Porta HTTP no host                  |
| `PROXY_HTTPS_PORTA` | `443`                                 | Porta HTTPS no host                 |
| `CADDYFILE`         | `infra/servidor/Caddyfile`            | Caddyfile para DNS, IPv4 ou interno |
| `CERTBOT_CERTS_DIR` | `./infra/servidor/nginx/certificados` | Certificados do Nginx               |

### Instalação Compose e serviços

| Variável                            | Padrão                                 | Uso                                                                      |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `COMPOSE_PROJECT_NAME`              | obrigatório                            | Nome explícito do projeto Compose                                        |
| `SERVIDOR_IDENTIDADE_ARQUIVO`       | `$SERVIDOR_CONFIG_DIR/identidade.json` | Registro privado da identidade adotada                                   |
| `SERVIDOR_LOCK_DIR`                 | `/var/lock/frequenciapp`               | Diretório 0700 das travas por projeto                                    |
| `COMPOSE_ARQUIVOS`                  | arquivos de referência                 | Lista separada por `:`. Com a observabilidade ligada, incluir o overlay. |
| `SERVIDOR_SERVICO_APP`              | `app`                                  | Serviço da aplicação                                                     |
| `SERVIDOR_SERVICO_DB`               | `db`                                   | Serviço do banco                                                         |
| `SERVIDOR_SERVICO_PROXY`            | `caddy` ou `nginx`                     | Serviço do proxy                                                         |
| `SERVIDOR_SERVICO_BACKUP_PLANILHAS` | `backup-planilhas`                     | Serviço opcional de backup de planilhas                                  |

### Backup e atualização

A lista completa está em [backup-servidor.md](backup-servidor.md) e em `infra/servidor/servidor.env.example`.

## Subir com Caddy

Para TLS público com domínio DNS:

```text
PROXY_TIPO=caddy
TLS_MODO=acme
CADDYFILE=infra/servidor/Caddyfile
DOMINIO=frequencia.exemplo.br
ACME_EMAIL=administracao@escola.exemplo.br
ACME_CA=https://acme-v02.api.letsencrypt.org/directory
```

Para HTTPS público por IPv4, o instalador usa `--dominio` com o endereço público e seleciona o arquivo específico automaticamente. Na preparação manual, usar o fragmento abaixo no `ops.env`, substituindo `IPV4_PUBLICO` pelo endereço real do servidor:

```text
PROXY_TIPO=caddy
TLS_MODO=acme
CADDYFILE=infra/servidor/Caddyfile.ipv4
DOMINIO=IPV4_PUBLICO
ACME_EMAIL=administracao@escola.exemplo.br
ACME_CA=https://acme-v02.api.letsencrypt.org/directory
```

O arquivo para IPv4 declara o emissor ACME com perfil `shortlived` e `default_sni`, sem depender apenas das opções ACME globais. A autoridade precisa suportar esse perfil para IP, e o servidor precisa estar acessível nas portas 80 e 443. A opção de staging serve para ensaio e não produz uma cadeia publicamente confiável. O caminho IPv4 com Nginx e TLS ACME é recusado pelo instalador; não substituir por TLS interno para contornar essa recusa.

Os arquivos versionados e o `CADDYFILE` persistido são usados nas operações seguintes. Não depender de um override de teste não registrado. Depois da implantação autorizada, conferir o certificado e o acesso por um cliente externo, sem desativar a validação TLS, incluindo um cliente que não envie SNI. A configuração da renovação automática não comprova que uma renovação já ocorreu.

Ao reaplicar pelo instalador, o estado saudável da pilha não substitui a comparação entre o serviço Compose desejado e o proxy existente. Uma divergência de configuração reconcilia somente o proxy com `up -d --no-deps`, inclusive na retomada depois de persistir o ambiente. Essa comparação não detecta conteúdo editado manualmente em um arquivo cujo caminho de montagem permaneceu igual.

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

## Proxy reverso externo

O guia padrão usa Caddy ou Nginx deste projeto. Quando o TLS e o roteamento ficam em um proxy gerenciado, uma CDN ou um balanceador fora do projeto, a pilha continua válida, mas a sonda e o bloqueio de `/api/metricas` mudam de responsável. O detalhamento do contrato está em [observabilidade.md](observabilidade.md#proxy-reverso-gerenciado-fora-do-projeto).

### Ajustar a sonda

O alvo `https://proxy:443/api/saude` é específico da receita Compose, na qual o proxy do projeto ocupa o alias `proxy` na rede `publica`. Com proxy externo:

1. Trocar o alvo em `infra/observabilidade/prometheus/prometheus.yml` por um hostname ou IP alcançável pela rede `publica` do blackbox exporter. O caminho continua `/api/saude`.
2. Manter `headers.Host` e `tls_config.server_name` iguais ao domínio público, mesmo quando o alvo for um IP.
3. Apontar `tls_config.ca_file` para a CA que emitiu o certificado do proxy. Com CA pública, manter o conjunto de CAs do sistema. Nunca desativar a validação TLS.
4. Recriar o blackbox exporter e o Prometheus, porque os arquivos são montados na partida.
5. Conferir `probe_success{job="blackbox"}` e `probe_ssl_earliest_cert_expiry` em `/targets`.

O arquivo do repositório é uma referência. A configuração aplicada ao proxy gerenciado não é versionada aqui e precisa ser conferida no painel ou no repositório do provedor.

### Conferir o bloqueio efetivo

O bloqueio de `/api/metricas` pertence ao proxy que atende o domínio. O `Caddyfile` e o `nginx.conf` do repositório só provam o bloqueio quando são a configuração aplicada.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dominio/api/metricas
```

O resultado precisa ser `404`. Conferir também na configuração efetiva do provedor que a regra vem antes do encaminhamento e que não existe rota alternativa por outro hostname, IP ou caminho equivalente. A coleta interna continua exigindo o token, então um `200` público indica falha de borda mesmo que o backend recuse a requisição sem credencial.

### Roteiro manual do proxy externo

1. Confirmar que o domínio resolve para o proxy e que o hostname ou IP do alvo é alcançável pela rede `publica` do blackbox exporter.
2. Conferir o certificado com SNI e CA corretos, sem `-k`:

   ```bash
   openssl s_client -connect proxy.exemplo.br:443 -servername frequencia.exemplo.br \
     -CAfile /etc/frequenciapp/ca-interna.pem </dev/null
   ```

3. Confirmar a saúde do domínio com `Host` e SNI iguais ao domínio. O resultado esperado é `200` em `/api/saude`.
4. Confirmar o bloqueio de `/api/metricas` no proxy efetivo e que a rota não chega ao backend.
5. Confirmar o backend privado e autenticado: a aplicação não publica porta, a coleta sem token responde `401` ou `404` e a coleta com `METRICAS_TOKEN` responde `200`.
6. Registrar a evidência da configuração do proxy, sem token, sem dado de aluno e sem caminho de host.

O ensaio sintético do repositório reproduz esse roteiro com um proxy separado, vhosts sintéticos e uma CA de fixture:

```bash
setpriv --no-new-privs node tests/servidor/proxy-externo.mjs
```

Ele prova o padrão, não a configuração do provedor. Nenhuma porta é publicada e nenhum serviço real é reiniciado. O ensaio usa as imagens fixadas do repositório e espera que elas já estejam presentes; `pnpm run servidor:validar` prepara o ambiente.

### Diagnóstico com proxy externo

- `probe_success` em `0` e `probe_http_status_code` em `0` indicam falha de resolução, conexão ou TLS antes do HTTP.
- Certificado recusado indica SNI, `ca_file` ou cadeia divergente. Conferir o SAN do certificado e a CA do proxy, sem desativar a validação.
- `/api/saude` com `404` ou `421` indica `Host`, SNI ou vhost errado no proxy externo.
- `/api/saude` com `502` ou `503` indica que o proxy alcançou a borda, mas não o backend.
- `probe_success` em `1` e `/api/metricas` público em `200` indicam bloqueio ausente no proxy efetivo.
- Conferir os logs do exporter com `scripts/servidor/compose.sh logs --tail 200 blackbox-exporter`.

### Retorno ao proxy do projeto

Para voltar ao Caddy ou ao Nginx deste projeto:

1. Definir `PROXY_TIPO=caddy` ou `PROXY_TIPO=nginx` no `ops.env`.
2. Remover o proxy externo da frente do domínio ou manter apenas o encaminhamento de TCP para as portas 80 e 443 do host, sem duplicar TLS e sem deixar dois proxies terminando TLS ao mesmo tempo.
3. Restaurar o alvo `https://proxy:443/api/saude` em `prometheus.yml`, com `Host` e `server_name` iguais ao `DOMINIO`. Remover `ca_file` quando a CA voltar a ser pública.
4. Recriar a pilha e conferir `/api/saude`, `/api/metricas` público com `404`, o painel no loopback e os alvos em `/targets`.
5. No perfil com controlador adotado, tratar a troca como mudança de topologia e executar a readoção revisada descrita em [controlador-manutencao.md](controlador-manutencao.md#observabilidade).

### O que informar ao pedir ajuda

Ao relatar um problema com proxy externo, incluir apenas dados operacionais:

- domínio público e o alvo configurado no blackbox, como hostname ou IP e porta;
- rede pela qual o exporter alcança o proxy e o alias usado, quando existir;
- valores de `Host`, `server_name` e tipo de CA, sem o conteúdo de chaves ou tokens;
- saída de `probe_success`, `probe_http_status_code` e `probe_ssl_earliest_cert_expiry`;
- código HTTP de `/api/saude` e `/api/metricas` no domínio público;
- trecho da regra do proxy efetivo, sem credenciais;
- se o controlador está adotado e se a entrada estável está em uso.

Não informar `METRICAS_TOKEN`, senha SMTP, URL de webhook, dado de aluno, turma, escola ou caminho de host.

## Alertas externos

O Alertmanager é opt-in e não publica portas. Para receber notificações por webhook ou e-mail, configurar apenas um receptor no `ops.env` e subir o serviço com o perfil `alertas`:

```bash
scripts/servidor/compose.sh --profile alertas up -d alertmanager
```

O Prometheus já envia alertas para `alertmanager:9093`. Sem o perfil, os alertas aparecem apenas no painel. O detalhamento dos receptores, do teste com `amtool` e do desligamento está em [observabilidade.md](observabilidade.md#alertas).

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

## VPS único como destino de produção

O VPS Ubuntu 26.04 LTS é o único destino de produção. A Vercel fica como ambiente de preview ou desligada, sem deploy automático da `main`. Manter os dois caminhos ativos cria dois bancos, duas agendas e duas origens de dados para o mesmo domínio, com divergência crescente de schema e de dados.

O instalador não autentica no GitHub nem na Vercel, não define variáveis de repositório e não altera o projeto da Vercel. O corte é executado pelo operador, conferido item a item e registrado conforme o checklist deste guia.

### Variáveis do repositório

Com o GitHub CLI autenticado e permissão de administração no repositório, executar:

```bash
gh variable set DEPLOY_TARGET --body servidor
gh variable set AGENDA_EXTERNA --body servidor
gh variable set BACKUP_EXTERNO --body servidor
gh variable list
```

As variáveis ficam no nível do repositório e valem para todos os workflows. Elas são texto comum, não segredo, e não substituem `CRON_SECRET` nem as credenciais da Vercel.

| Variável                  | Efeito esperado                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_TARGET=servidor`  | `implantacao.yml` e `migracoes.yml` são pulados; a produção de nuvem deixa de migrar e publicar na `main` e em release.                     |
| `AGENDA_EXTERNA=servidor` | Os jobs de `notificacoes.yml` e `fila-planilha.yml` são pulados; a agenda do servidor assume notificações, fila de planilhas e indicadores. |
| `BACKUP_EXTERNO=servidor` | O job de `backup-externo.yml` é pulado; o backup das planilhas passa a ser responsabilidade da rotina do servidor.                          |

`implantacao.yml` e `migracoes.yml` aceitam apenas vazio ou `vercel` para publicar; qualquer outro valor, incluindo `servidor`, impede o job de executar. Em `notificacoes.yml`, `fila-planilha.yml` e `backup-externo.yml`, a condição é a ausência de `servidor`; remover a variável reativa o job.

Com as três variáveis, a nuvem deixa de migrar, publicar, agendar e copiar arquivos. O VPS precisa estar com DNS, TLS, backup verificado, agenda ativa e notificações funcionando antes do corte.

### Desligar a Vercel

O `vercel.json` do repositório já define `git.deploymentEnabled` com a `main` desligada. A variável `DEPLOY_TARGET` desliga apenas a sequência de produção do GitHub Actions; o preview depende da integração de Git do projeto e não é alterado pelos comandos `gh variable set`. A configuração do projeto na Vercel também precisa ser conferida no painel:

1. Abrir as configurações de Git do projeto.
2. Desativar a publicação automática da branch `main`.
3. Manter as demais branches como preview, quando o preview for desejado.
4. Conferir que os previews usam banco descartável, nunca o banco de produção do VPS.

Sem preview, desativar a integração de Git do projeto ou remover o domínio de produção da Vercel. O botão de deploy da Vercel do README atende a outra escola ou a uma demonstração, não a instalação de produção desta escola.

### Checklist de conferência

| Item                  | Conferência                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Variáveis             | `gh variable list` mostra as três variáveis com `servidor`.                                                           |
| Workflows de produção | `implantacao.yml` e `migracoes.yml` aparecem como pulados no próximo push ou disparo manual.                          |
| Agendas do GitHub     | `notificacoes.yml` e `fila-planilha.yml` aparecem como pulados; o agendador do servidor executa a cada cinco minutos. |
| Backup externo        | `backup-externo.yml` aparece como pulado; `ultimo-backup.json` tem `verificadoRemoto` igual a `true`.                 |
| Vercel                | O deploy Git da `main` está desligado no repositório e no painel; o preview segue a decisão da escola.                |
| DNS                   | O domínio de produção aponta para o VPS, sem CNAME para a Vercel.                                                     |
| TLS                   | O certificado cobre o domínio de produção e a renovação está agendada.                                                |
| Agenda                | As rotas de notificações, fila de planilhas e indicadores respondem `200` a partir do VPS.                            |
| Notificações          | Os dispositivos recebem um único aviso, sem duplicidade entre VPS e nuvem.                                            |
| Banco único           | Só o VPS usa a `DATABASE_URL` de produção; previews e nuvem usam banco descartável ou nenhum banco.                   |
| Saúde                 | `https://frequencia.exemplo.br/api/saude` responde com o commit esperado.                                             |

### Riscos dos dois caminhos ativos

- Dois bancos de produção recebem escritas e divergem; a restauração de um não recupera o outro.
- Duas agendas consultam as mesmas rotas e duplicam notificações, fila de planilhas e indicadores.
- Uma migração aplicada pela nuvem deixa o schema do VPS atrás ou à frente do código em execução.
- Dois backups externos gravam conjuntos diferentes e dão falsa cobertura sobre o mesmo banco.
- O operador perde a referência de qual endereço é produção, o que atrasa o diagnóstico e a restauração.

### Reversão

Para voltar ao caminho anterior, remover as variáveis e reativar a publicação da `main` na Vercel, nesta ordem:

```bash
gh variable delete DEPLOY_TARGET
gh variable delete AGENDA_EXTERNA
gh variable delete BACKUP_EXTERNO
```

- Conferir no painel da Vercel que o deploy Git da `main` voltou a ser permitido.
- Manter um único banco de produção: migrar os dados com backup verificado antes de trocar o endereço.
- Desligar o agendador da agenda do servidor e as rotinas de backup quando a nuvem reassumir, para não duplicar chamadas.
- Registrar a decisão, a data e o efeito no histórico operacional da escola, sem dados de aluno.

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
9. Se a partida falhar, a imagem anterior não é iniciada automaticamente. Desativar o migrador ou não ter diferença no Git não comprova a compatibilidade do banco com a imagem anterior.

No modo `main`, o Dockerfile ajusta as permissões dos arquivos copiados para execução. A imagem precisa passar na verificação de acesso como usuário `node`, mesmo quando a worktree é criada com `umask 077`. Essa verificação ocorre durante o build, antes de substituir o contêiner, e não altera as permissões de credenciais ou backups no host. A saúde do aplicativo e a conexão com o banco continuam sendo verificadas após a partida.

O backup de planilhas é opcional. Quando `BACKUP_PLANILHAS_HABILITADO=false`, a imagem `backup-planilhas` não é baixada nem construída.

A atualização automática pelo cron não é instalada por padrão. `ATUALIZAR_HABILITADO=false` mantém a rotina fora do cron; defina `true` somente depois de revisar a agenda e o rollback.

#### Aprovação de migrações no cron da `main`

As rotinas geradas usam `--agendado`. Nesse modo, nem `ATUALIZAR_PERMITIR_MIGRACOES=true` nem a opção manual liberam migrações. A permissão por execução, `--permitir-migracoes`, continua disponível fora do cron. Antes de adotar o fluxo em um cron personalizado, revise seu lançador: ele precisa invocar o atualizador com `--agendado` e delegar a conferência das migrações, sem remover guardas próprias de Compose ou de outros arquivos operacionais.

Após conferir o backup, ensaiar o candidato em um banco isolado e obter aprovação da manutenção, gere um manifesto com os SHAs completos da revisão instalada (`BASE`) e da candidata (`ALVO`). Informe o início e o fim em UTC, no formato `AAAA-MM-DDTHH:MM:SSZ`. A janela dura no máximo 24 horas e precisa incluir a execução prevista do cron.

```bash
umask 077
rascunho=$(mktemp "${ESTADO_DIR:?}/.aprovacao.XXXXXX")
node scripts/servidor/aprovacao-migracoes.mjs preparar "$PWD" "$BASE" "$ALVO" "$INICIO_UTC" "$FIM_UTC" > "$rascunho"
```

O comando só gera o manifesto; não autoriza a implantação nem executa migrações. Após a revisão, publique o conteúdo de forma atômica em `$ESTADO_DIR/aprovacao-migracoes.json`, com modo `0600` e propriedade da conta que executa a operação. Não inclua o manifesto no Git. Somente adições de arquivos `migration.sql` em diretórios de migração são aceitas; edições ou remoções exigem revisão manual. O hash não classifica o SQL como seguro.

O atualizador compara a base instalada, a ponta da `main`, a janela e o SHA-256 de cada SQL. Exige que o histórico ativo no banco Compose corresponda às migrações da revisão instalada, sem registros incompletos ou checksums divergentes. Repete as conferências após o backup e a preparação da imagem e registra o uso único antes de trocar a versão. Em caso de falha depois do registro, preserve o recibo `aprovacao-migracoes-<sha>.usada.json` e revise o estado do banco antes de qualquer intervenção. O backup continua obrigatório, e voltar à imagem anterior não desfaz uma migração confirmada. `--simular --agendado` verifica somente refs locais, sem consumir a aprovação.

Uma instalação antiga não atualiza o próprio agendamento ao receber essa revisão. A adoção inicial do código e a atualização do cron são etapas operacionais separadas.

##### Política automática sem manifesto por lote

`ATUALIZAR_APROVAR_MIGRACOES_AUTOMATICAMENTE=false` é o padrão. Com `true` no `ops.env` privado, o atualizador agendado do **controlador adotado** pode aprovar automaticamente migrações elegíveis. A opção não instala nem habilita o cron, não vale no canal `release` e não muda a execução manual. Um lançador personalizado não deve repassar `--permitir-migracoes` para contornar a política: deve usar a entrada estável do controlador com `atualizar --agendado`, mantendo as próprias guardas de Compose e scripts. Sem o controlador, o fluxo automático recusa a migração.

- O alvo deve ser o próximo commit da `main` canônica em relação à revisão instalada. O workflow pós-merge e seus insumos confiáveis já precisam estar presentes na base, sem mudança no lote. Execução em PR, prova ausente ou um intervalo de migrações acumuladas requerem revisão manual.
- Só aceita novos arquivos `migration.sql` ordenados. A política reconhece `CREATE TABLE` simples e adição de coluna anulável sem `DEFAULT`, com tipos incorporados e sem dependências externas. SQL fora desse subconjunto, edições ou remoções de migrações e mudanças de Compose, scripts operacionais ou da construção da imagem não são aprovados automaticamente.
- Exige o histórico exato no mesmo PostgreSQL do backup, da aplicação e do migrador, um [ensaio de recuperação registrado](backup-servidor.md), e um novo backup cifrado verificado local e remotamente, fixado pelo controlador. Após o build, o atualizador confere os bytes da imagem, o backup e a tentativa do CI antes de gravar `migracoes-auto.json` no journal protegido.
- A subida usa a imagem conferida, sem recriar o banco ou o proxy e sem reinício automático do app até conferir a saúde e o histórico final. O migrador reconfere o lote sob travas com prazo e aplica o SQL e o histórico na mesma transação. Uma recusa confirmada antes da troca mantém a versão em uso. Após registrar a aprovação, uma falha ou interrupção fica incerta: preserve o journal e o backup fixado. Não repita o cron nem faça rollback automático: a imagem anterior não desfaz alterações no banco.

Adote primeiro a revisão e o agendamento confiáveis com a opção desligada. Só ative após confirmar o alvo, o backup recuperável e a janela do agendamento. Para ativar ou desligar, use a [reconfiguração administrativa da política](controlador-manutencao.md), não uma edição direta do `ops.env` com o controlador adotado. O lançador privado pode fixar a revisão conferida com `atualizar --agendado --modo main --ref <SHA-completo>`; se a ponta mudar, o atualizador recusa a troca. Voltar a `false` impede novas aprovações automáticas; não cancela nem desfaz migração iniciada. `--simular --agendado` não consome aprovação nem ensaia recuperação ou aplicação.

`ATUALIZAR_VERIFICAR_IMAGEM=true` confere o rótulo da imagem antes da aplicação. `ATUALIZAR_BACKUP_ANTES=false` é rejeitado porque o backup anterior é obrigatório.

Quando o healthcheck usa HTTPS com CA interna, defina `ATUALIZAR_SAUDE_CA` e `RESTAURAR_SAUDE_CA` com o caminho do certificado. Sem a CA, o `curl` usa o repositório do sistema.

No perfil simples, a atualização manual com o migrador na partida confere a revisão servida, a identidade física das conexões do aplicativo e o histórico da base, mesmo sem diferenças em `prisma/migrations`. Histórico incompleto, ilegível ou divergente impede a troca; a ausência de diferenças no Git não comprova que o banco esteja atualizado. `--permitir-migracoes` autoriza novos SQLs que preservem as migrações da base, mas não dispensa a conferência da imagem nem ativa a política agendada. A partida aplica apenas o serviço do aplicativo, sem recriar dependências.

A imagem alvo precisa incluir esse protocolo, mesmo que a instalação atual seja mais antiga. Na partida, o próprio migrador confere o histórico, a conexão e os SQLs autorizados antes de gravar. O reinício automático só volta depois da revogação da autorização de escrita. O mesmo contêiner pode reiniciar com o lote completo, sem reaplicar SQL; se o banco voltar à base após uma restauração, o contêiner não pode reaplicar o lote sem nova autorização. Com o migrador ativo, o modo manual protegido recusa `--forcar` para a mesma revisão antes de gerar backup ou trocar o contêiner.

O atualizador confere a estrutura de `_prisma_migrations` antes do backup e da troca do aplicativo. O migrador repete a conferência sob as travas do PostgreSQL. A segurança por linha (RLS) habilitada é compatível quando não é forçada, não há políticas na tabela e a sessão não está sujeita à filtragem. Uma configuração incompatível não exige desligar a RLS: o atualizador recusa a transição sem trocar o aplicativo em uso.

A atualização manual aceita manter o app em uma rede externa `bridge` local já existente, por exemplo para um proxy compartilhado de confiança. O PostgreSQL deve estar ligado apenas à rede interna da instalação, que não pode ser externa. O atualizador exige que os IDs das redes do app e do banco correspondam ao esperado antes e depois da troca. Nesse perfil, a base é conferida pela revisão da imagem ativa e pelas sondas do banco, sem chamar `/api/saude` no app antigo. As sondas recusam resolução ambígua antes de se autenticar.

Na partida protegida com borda, a resolução local do contêiner fixa o nome do PostgreSQL ao IPv4 privado conferido para o migrador e para o aplicativo. A saúde HTTP do app novo continua sendo conferida. Esse vínculo permanece até recriar o contêiner. Se o IPv4 do banco mudar, reconfira o destino e prepare a recriação em manutenção, sem reutilizar a autorização anterior. A exceção não se aplica à aprovação automática de migrações no cron.

Uma recusa anterior à troca não exige restauração. Depois de persistir a intenção de troca, a operação só é liberada após confirmar histórico, identidade do banco, revisão servida e saúde do aplicativo. Em caso de interrupção ou resultado incerto, as rotinas compatíveis bloqueiam novas mutações e preservam o backup; não há rollback automático da imagem nem do banco. O marcador `atualizacao-manual-pendente.json` identifica as revisões, a fase e o conjunto de recuperação. Não repetir com `--forcar` nem remover o marcador como forma de retomar. A recuperação exige primeiro uma avaliação da instalação e das escritas posteriores ao backup.

A primeira invocação sobre um checkout antigo exige uma cópia separada da árvore fonte da revisão alvo. Execute `scripts/servidor/atualizar.sh` dessa cópia, com `APP_DIR` apontando para a instalação e usando a configuração, o estado e a trava das rotinas adotadas. Não copie apenas `scripts/servidor`: o verificador usa também `docker/app` e `src/infra` da revisão confiável. Scripts antigos, agendadores que ainda os chamem e acesso direto ao Docker ou ao banco não respeitam o novo marcador. Antes de usar esse fluxo numa instalação existente, a adoção precisa impedir esses caminhos durante toda a intervenção, inclusive após uma falha. A cópia não altera nem desativa agendamentos por conta própria.

Em uma janela de manutenção autorizada, inventarie agendamentos, serviços e invocações manuais de atualização, backup, retenção, restauração e Compose. Impeça novas chamadas legadas e confirme o término das já iniciadas antes de invocar a cópia revisada. Preserve o mesmo projeto Compose, os arquivos de ambiente e a identidade, o diretório de estado e o arquivo de trava adotados. Não autorize partida direta do contêiner após perda do atualizador: a partida automática segue desativada em fase incerta e a autorização efêmera pode ainda existir. Mantenha as entradas antigas indisponíveis até reconciliar o marcador, o banco, o aplicativo e o backup; só então retome rotinas por entradas compatíveis. Esse procedimento não é executado por `atualizar.sh`.

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
- Alertar quando o backup mais recente tiver mais de 24 horas, pela regra `FrequenciappBackupAtrasado` ou pelo `MAILTO`.
- Alertar quando o certificado estiver próximo do vencimento, pela regra `FrequenciappCertificadoExpirando`.
- Monitorar espaço em disco do banco, dos logs e do backup, pela regra `FrequenciappDiscoBaixo`.
- Revisar a agenda do GitHub quando ela for usada na nuvem.
- Com a observabilidade ligada, seguir [observabilidade.md](observabilidade.md). O painel do Prometheus reúne `/targets`, `/alerts` e `/rules`.
- Com controlador adotado, conferir que o snapshot contém o overlay, `infra/observabilidade/**` e o Caddyfile ou o diretório do Nginx. A entrada estável usa o snapshot como projeto Compose e não lê esses arquivos do checkout mutável.
- Conferir `up{job="frequenciapp"}`, `up{job="node-exporter"}` e `up{job="blackbox"}` em `1` e, com o perfil `alertas`, `up{job="alertmanager"}` em `1`.
- Conferir `probe_success{job="blackbox"}` em `1` e os dias restantes em `probe_ssl_earliest_cert_expiry`.
- Separar a falha da sonda do estado do site: `up{job="blackbox"}` fora do ar, `probe_success` ausente e `probe_success` igual a `0` têm regras e janelas próprias.
- Com proxy externo, ajustar o alvo, o Host, o SNI e a CA no exporter e conferir o bloqueio de `/api/metricas` no proxy efetivo, conforme [Proxy reverso externo](#proxy-reverso-externo).
- Conferir a idade do item aberto mais antigo da fila e a idade do último backup verificado.

As treze regras cobrem indisponibilidade, erros 5xx, latência, pool, fila, disco, memória, sonda HTTPS, coletor da sonda, ausência de amostra, certificado, falha de notificação e atraso do backup. Sem o perfil `alertas`, o alerta aparece apenas no painel. A tabela completa está em [observabilidade.md](observabilidade.md#alertas).

### Validar a observabilidade

1. `curl -s -o /dev/null -w '%{http_code}\n' https://dominio/api/metricas` deve devolver `404`.
2. O acesso local ao painel, ou o túnel administrativo temporário de [observabilidade.md](observabilidade.md#painel-e-acesso), deve abrir `http://localhost:9090` e mostrar os alvos `frequenciapp`, `node-exporter` e `blackbox` em `/targets`.
3. Com o perfil `alertas`, o alvo `alertmanager` também deve aparecer em `/targets`. Sem o perfil, ele aparece fora do ar e nenhuma regra dispara por isso.
4. `ss -lntp | grep 9090` deve mostrar `127.0.0.1:9090`, nunca `0.0.0.0:9090`.
5. A coleta com o token do ambiente deve devolver `200` e linhas `frequenciapp_`, conforme o comando do guia.
6. As consultas `up{job="blackbox"}` e `probe_success{job="blackbox"}` devem devolver `1`, e `probe_ssl_earliest_cert_expiry` deve estar presente.
7. Depois do primeiro backup verificado, `frequenciapp_backup_ultimo_sucesso_timestamp_seconds` deve aparecer com o instante do backup.
8. Com o perfil `alertas`, `alertmanager_notifications_failed_total` deve estar disponível e o teste com `amtool alert add` deve chegar ao receptor.
9. `pnpm run servidor:validar` deve passar, incluindo `promtool test rules` com as séries sintéticas de sonda e coletor.
10. Com proxy externo, seguir o [roteiro manual](#roteiro-manual-do-proxy-externo), executar `setpriv --no-new-privs node tests/servidor/proxy-externo.mjs` e registrar que o ensaio sintético não comprova a configuração do provedor.

A matriz de respostas de `/api/metricas` é: borda pública, Caddy ou Nginx, 404 antes do proxy; rota interna sem `METRICAS_TOKEN` configurado, 404; token ausente ou errado, 401; token correto, 200 com `text/plain; version=0.0.4; charset=utf-8` e `Cache-Control: no-store`; falha de coleta, 503 com corpo JSON curto. O detalhamento está em [observabilidade.md](observabilidade.md#respostas-da-rota). A rota continua fora do OpenAPI público.

## Segurança

- Manter `PERMITIR_HTTP=false` com TLS.
- Não publicar as portas 3000 e 5432.
- Proteger `app.env`, `ops.env` e `rclone.conf` com permissão 600 ou 640.
- O receptor do Alertmanager usa arquivos com modo 600 em `/tmp` e campos nativos `url_file`, `credentials_file` e `smtp_auth_password_file`. Nenhum segredo vai para argumento de processo externo.
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

### Migração incompleta ou checksum divergente

O migrador encerra com código 4 e não aplica migrações novas quando encontra um registro sem `finished_at` e sem `rolled_back_at` em `_prisma_migrations` ou quando o checksum de uma migração já aplicada difere do arquivo em `prisma/migrations`. A aplicação não inicia. O banco e os dados devem ser preservados; a recuperação começa pela leitura do histórico, não pela remoção de tabelas, do schema ou do volume.

1. Ler os logs do contêiner da aplicação e localizar a mensagem `[migrar]`:

   ```bash
   scripts/servidor/compose.sh logs --tail 200 app
   ```

2. Conferir o estado das migrações com `prisma migrate status`. A partir do checkout, em uma estação com Node e pnpm instalados e `DIRECT_URL` apontando para a conexão de sessão:

   ```bash
   DIRECT_URL='postgresql://usuario:senha@host:5432/frequencia' pnpm exec prisma migrate status
   ```

   No servidor, o mesmo comando roda em um contêiner descartável da imagem da aplicação, com o `prisma.config.ts` do checkout montado:

   ```bash
   scripts/servidor/compose.sh run --rm --no-deps \
     -v "${APP_DIR:-/opt/frequenciapp}/prisma.config.ts:/app/prisma.config.ts:ro" \
     --entrypoint ./node_modules/.bin/prisma app migrate status
   ```

3. Inspecionar `_prisma_migrations` no schema configurado. A consulta é somente leitura:

   ```bash
   scripts/servidor/compose.sh exec db psql \
     -U "${POSTGRES_USER:-frequencia}" -d "${POSTGRES_DB:-frequencia}" \
     -c "select migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs from \"${DATABASE_SCHEMA:-public}\"._prisma_migrations order by started_at;"
   ```

Um registro com `finished_at` nulo e `rolled_back_at` nulo é o caso de migração incompleta. A coluna `logs` traz o erro registrado pelo Prisma CLI, quando existir. A mensagem `[migrar]` também informa o nome da migração bloqueada.

#### Recuperar uma migração incompleta

A decisão depende do que a migração já alterou no banco. `prisma migrate resolve --rolled-back` apenas registra que a migração deve ser reaplicada; ele não desfaz SQL executado. Antes de usá-lo, conferir cada objeto criado ou alterado pela migração e confirmar que não restou efeito parcial. Se houver efeito parcial que não possa ser desfeito com segurança, restaurar o backup anterior.

Para marcar a migração como revertida depois da revisão:

```bash
scripts/servidor/compose.sh run --rm --no-deps \
  -v "${APP_DIR:-/opt/frequenciapp}/prisma.config.ts:/app/prisma.config.ts:ro" \
  --entrypoint ./node_modules/.bin/prisma app migrate resolve --rolled-back 20260101000000_exemplo
```

Depois, subir a aplicação para o migrador reaplicar a migração:

```bash
scripts/servidor/compose.sh up -d app
scripts/servidor/compose.sh logs --tail 100 app
```

Baixar a cópia remota com rclone antes de restaurar, quando o arquivo não estiver no servidor:

```bash
scripts/servidor/restaurar.sh --arquivo /caminho/backup.dump.age --confirmar
```

A restauração segue o roteiro de [backup-servidor.md](backup-servidor.md):

- valida o checksum, quando o arquivo `.sha256` existe;
- confere o histórico de migrações;
- para a aplicação;
- troca o banco mantendo uma cópia do anterior.

Um dump anterior ao checkout pode receber as migrações pendentes na subida. Se a restauração recusar o histórico por divergência, a decisão precisa ser administrativa e registrada; `RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=true` não substitui a conferência.

#### Corrigir checksum divergente

O checksum divergente indica que o arquivo `prisma/migrations/<nome>/migration.sql` não é o mesmo que foi aplicado. A migração já está registrada no banco e não deve ser reaplicada nem apagada. As opções, em ordem de preferência:

1. Restaurar o arquivo original a partir do commit ou da tag implantada:

   ```bash
   git show <commit>:prisma/migrations/<nome>/migration.sql > prisma/migrations/<nome>/migration.sql
   ```

   Conferir `git diff` e subir a aplicação. O checksum volta a coincidir sem alterar dados. A alteração local resolve a subida imediata, mas deixa a árvore Git suja, o que bloqueia a próxima atualização; a correção definitiva precisa entrar em um commit ou release.

2. Se a alteração do arquivo for intencional, criar uma migração nova com a diferença e manter o arquivo já aplicado intacto. Migração aplicada nunca é editada.

3. Se o banco recebeu um dump de outra origem ou o histórico não corresponde ao checkout, restaurar um backup compatível com o código implantado.

Não editar o checksum em `_prisma_migrations`, não remover linhas do histórico e não apagar tabelas, o schema ou o volume para contornar a divergência. O comando `prisma migrate reset` nunca deve ser executado em produção: ele apaga o schema e os dados. Quando a recuperação não puder ser feita sem perda, abrir uma decisão administrativa com a coordenação, registrar o backup usado e seguir o roteiro de restauração.

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

### Observabilidade sem coleta

- Conferir `scripts/servidor/compose.sh ps` e os serviços `prometheus`, `prometheus-ui`, `node-exporter` e `blackbox-exporter`.
- Conferir `up{job="frequenciapp"}` e o último erro em `/targets`.
- Um 404 no alvo indica `METRICAS_TOKEN` ausente na aplicação. Um 401 indica token divergente entre a aplicação e o Prometheus. Um 503 indica falha de coleta ou de serialização do registro; conferir os logs da aplicação.
- Conferir a rede `interna` e o alvo `app:3000`.
- Conferir os logs com `scripts/servidor/compose.sh logs --tail 200 prometheus`.
- Validar configuração e regras com `promtool`, conforme [observabilidade.md](observabilidade.md#validar-configuração-e-regras).

### Coletor da sonda indisponível

- Quando `up{job="blackbox"}` vale `0` por 5 minutos, o alerta `FrequenciappSondaColetorIndisponivel` dispara com gravidade `critical`.
- Conferir `scripts/servidor/compose.sh ps` e os logs com `scripts/servidor/compose.sh logs --tail 200 blackbox-exporter`.
- Conferir o alvo `blackbox-exporter:9115` na rede `interna` e o último erro em `/targets`.
- Enquanto o coletor estiver fora do ar, `probe_success` não é atualizado e o estado do site não pode ser confirmado.

### Sonda sem amostra

- Quando `up{job="blackbox"}` vale `1`, mas `probe_success{job="blackbox"}` não existe por 10 minutos, o alerta `FrequenciappSondaSemAmostra` dispara com gravidade `warning`.
- Conferir em `/targets` se o alvo `blackbox` está saudável e se a coleta tem sucesso.
- Conferir `probe_success{job="blackbox"}` em `/graph` e a última amostra recebida.
- Conferir `DOMINIO`, o alias `proxy` e o alvo `https://proxy:443/api/saude` no `prometheus.yml`.

### Sonda sem resposta 200

- Quando `probe_success{job="blackbox"}` vale `0` por 5 minutos, o alerta `FrequenciappSondaHttps` dispara com gravidade `critical`. A mensagem não afirma que o site está fora do ar: a falha pode ser do serviço, do proxy ou da sonda.
- Conferir `probe_success{job="blackbox"}` e o último erro do alvo `blackbox` em `/targets`.
- Conferir o `DOMINIO` em `/etc/frequenciapp/ops.env` e, na receita Compose, o alias `proxy` na rede `publica` do Caddy ou do Nginx.
- Com proxy externo, conferir o alvo alcançável pela rede `publica`, o Host, o SNI e a CA, além do bloqueio de `/api/metricas` na configuração efetiva, em [Proxy reverso externo](#proxy-reverso-externo).
- Conferir `probe_http_status_code` para separar recusa, tempo limite e status inesperado.
- Em TLS interno ou com CA privada, conferir a CA montada e o `ca_file` no `blackbox.yml`.
- Conferir os logs com `scripts/servidor/compose.sh logs --tail 200 blackbox-exporter`.

### Certificado TLS expirando

- Conferir `probe_ssl_earliest_cert_expiry` e os dias restantes em `/graph`.
- No Caddy, conferir a renovação automática e os logs do proxy.
- No Nginx, executar `scripts/servidor/renovar-certificado.sh --dry-run` e conferir o cron da renovação.
- Em TLS interno, renovar na CA da escola e substituir os arquivos do proxy.

### Disco ou memória

- Conferir `node_filesystem_avail_bytes` e `node_memory_MemAvailable_bytes` em `/graph`.
- Conferir `df -h` e `free -m` no host.
- Conferir o crescimento de `/var/lib/docker`, dos volumes, dos logs e do backup.
- Revisar as exclusões da regra antes de concluir que o alerta é falso positivo.

### Backup atrasado

- Conferir a consulta de idade do backup em `/graph`.
- Conferir `/var/lib/frequenciapp/ultimo-backup.json` e `/var/lib/frequenciapp/metricas/ultimo-backup.prom`.
- Se a métrica não existir, nenhum backup verificado foi concluído. Conferir o cron, o `MAILTO` e os logs da rotina.
- Conferir `BACKUP_*`, a chave de cifra e o destino remoto em [backup-servidor.md](backup-servidor.md).
- A falha de escrita da métrica gera aviso e não falha o backup. O arquivo só muda depois de um backup verificado ou de uma verificação sem `--sem-escrita`.

### Alertmanager sem entrega

- Conferir se o perfil `alertas` está ativo e se `up{job="alertmanager"}` vale `1`.
- Conferir `scripts/servidor/compose.sh --profile alertas exec alertmanager amtool alert query` e os silêncios.
- Conferir `scripts/servidor/compose.sh --profile alertas exec alertmanager amtool check-config /tmp/alertmanager.yml`.
- Conferir `rate(alertmanager_notifications_failed_total{job="alertmanager"}[10m])` e os rótulos `integration` e `reason`.
- Conferir os logs com `scripts/servidor/compose.sh --profile alertas logs --tail 200 alertmanager`.
- Conferir o webhook ou o SMTP, a autenticação, a porta e a saída pela rede `publica`.
- Conferir `url_file`, `credentials_file` e `smtp_auth_password_file` na configuração gerada em `/tmp/alertmanager.yml` e os arquivos de segredo com modo 600.
- Um alerta silenciado não é notificado. Conferir a lista de silêncios antes de concluir que a entrega falhou.

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
- [Observabilidade](observabilidade.md)
- [Caddy: HTTPS automático](https://caddyserver.com/docs/automatic-https)
- [Caddy: opções globais](https://caddyserver.com/docs/caddyfile/options)
- [Nginx: imagem oficial](https://hub.docker.com/_/nginx)
- [Certbot: imagem oficial](https://hub.docker.com/r/certbot/certbot)
