# Observabilidade

Guia da coleta Prometheus do FrequenciApp na auto-hospedagem. A aplicação expõe métricas operacionais em `/api/metricas`, o Prometheus as coleta pela rede interna do Compose e o conjunto cobre aplicação, ações de domínio, host, HTTPS, certificado, entrega de alertas, idade do último backup e a coleta opcional no cluster Kubernetes. A decisão está na [ADR-079](adr/079-observabilidade-com-prometheus.md).

## O que é observado

- Requisições HTTP da API: contagem por método, rota e status, duração e requisições em andamento.
- Pool de conexões do PostgreSQL, latência das consultas e falhas de coleta.
- Fila de envio às planilhas: itens por estado e idade do item aberto mais antigo.
- Ações de domínio: salvamentos de frequência e conflitos de revisão, itens processados da fila de planilhas e avisos da agenda de notificações, por resultado.
- Processo Node.js: CPU, memória, descritores de arquivo, event loop, coletas de lixo e versão do runtime.
- Coleta no cluster: quando o chart Helm habilita o ServiceMonitor, o Prometheus Operator coleta `/api/metricas` pela porta `http` do Service, com o token lido do Secret.
- Host: CPU, carga, memória, uptime, disco e sistemas de arquivos, pelo node exporter.
- Sonda HTTPS: disponibilidade de `https://proxy:443/api/saude` e validade do certificado TLS, pelo blackbox exporter.
- Entrega de alertas: falhas de notificação do Alertmanager.
- Idade do último backup: instante do último backup verificado do banco.
- Saúde da coleta: os alvos `frequenciapp`, `prometheus`, `node-exporter`, `blackbox` e `alertmanager`; no cluster, o alvo criado pelo ServiceMonitor.

Não são observados páginas, navegador, service worker, dados de alunos, conteúdo de requisição, SQL, parâmetros de consulta, nome de arquivo de backup, caminho de diretório, chave de cifra ou conteúdo escolar.

## Arquitetura

```text
Caddy ou Nginx (80 e 443, alias de rede proxy)
        |
        v
   app:3000  (redes interna e publica)

   prometheus:9090  (somente rede interna)
        |
        +--> app:3000/api/metricas  (Bearer METRICAS_TOKEN)
        +--> node-exporter:9100
        +--> blackbox-exporter:9115  (sonda https://proxy:443/api/saude)
        +--> alertmanager:9093  (perfil alertas)
        +--> volume prometheus_data
        +--> prometheus-ui (socat, ponte TCP)
                 |
                 +--> 127.0.0.1:9090 (painel, acesso por túnel SSH)
```

- O proxy recebe a requisição pública e responde 404 para `/api/metricas` antes de encaminhar ao aplicativo.
- `src/proxy.ts` injeta `x-frequenciapp-rota` e `x-frequenciapp-metodo` nas demais rotas de API. `executarRota` mede a duração, captura o status e registra a métrica.
- Os contadores de domínio são incrementados nos adaptadores de rota: `POST /api/frequencias` registra `salvo` ou `conflito`, `/api/planilha/fila/agenda` e `/api/planilha/fila/processar` somam o resumo da fila, e `/api/notificacoes/agenda` soma o resumo dos avisos. A camada de aplicação não importa métricas.
- A rota não entra na especificação OpenAPI pública e não usa `executarRota`, para não se autoinstrumentar.
- O Prometheus coleta `http://app:3000/api/metricas` a cada 30 segundos, com tempo limite de 10 segundos e avaliação das regras a cada 30 segundos.
- O token fica em `app.env`. O entrypoint do Prometheus grava o valor em `/tmp/metricas-token`, com permissão restrita, e o `prometheus.yml` apenas referencia o arquivo.
- O node exporter lê o sistema de arquivos do host em `/host`, somente leitura, com `pid: host`. O diretório `$ESTADO_DIR/metricas` é montado em `/var/lib/node_exporter/textfile`, também somente leitura, e o coletor de textfile publica as métricas escritas pela rotina de backup.
- O blackbox exporter entra nas redes `interna` e `publica` para alcançar o alias `proxy`, que o Caddy e o Nginx declaram na rede `publica`. A sonda usa `Host` e `server_name` iguais ao domínio, por isso funciona com os dois proxies.
- O Alertmanager entra nas redes `interna` e `publica`. A rede `interna` permite que o Prometheus o colete e envie alertas; a rede `publica` existe apenas para alcançar o webhook ou o servidor SMTP do receptor.
- O Prometheus, o node exporter, o blackbox exporter e o Alertmanager não publicam portas. A aplicação e o banco também continuam sem portas no host. Apenas o proxy publica 80 e 443.
- O Docker não publica portas de um contêiner ligado apenas a uma rede `internal`. Por isso a ponte `prometheus-ui` publica `127.0.0.1:${PROMETHEUS_PORTA:-9090}` e encaminha somente para `prometheus:9090`. A ponte não aceita destino arbitrário, e o painel continua restrito ao loopback.
- O volume nomeado `prometheus_data` guarda o histórico do Prometheus. O volume `alertmanager_data` guarda silêncios e estado de notificação.

## Como habilitar

A observabilidade é opt-in. Instalações novas já nascem com ela ligada; instalações existentes sem a variável continuam sem Prometheus até uma decisão explícita.

O node exporter e o blackbox exporter acompanham a observabilidade: sobem junto com o Prometheus quando `OBSERVABILIDADE_HABILITADA=true`, sem perfil adicional. O Alertmanager é opt-in pelo perfil Compose `alertas` e exige um receptor configurado. A métrica de idade do backup aparece depois do primeiro backup verificado; antes disso, a série não existe.

### Instalação nova

O instalador grava o token e as variáveis operacionais. Depois da instalação:

1. Conferir `METRICAS_TOKEN` em `/etc/frequenciapp/app.env`, com modo 600.
2. Conferir `OBSERVABILIDADE_HABILITADA=true` e `PROMETHEUS_PORTA=9090` em `/etc/frequenciapp/ops.env`.
3. Conferir que os serviços `prometheus`, `prometheus-ui`, `node-exporter` e `blackbox-exporter` estão no projeto Compose.
4. Abrir o painel pelo túnel descrito em [Painel e acesso](#painel-e-acesso) e conferir os alvos em `/targets`.
5. Executar o primeiro backup verificado para publicar a métrica de idade.

### Instalação existente

O instalador preserva o valor existente de `OBSERVABILIDADE_HABILITADA`, inclusive `false`. Para ligar a coleta em uma instalação manual:

```bash
openssl rand -hex 32
```

1. Gravar o valor gerado em `METRICAS_TOKEN` no `app.env`, sem aspas e sem espaços.
2. Acrescentar ao `ops.env`:

   ```text
   OBSERVABILIDADE_HABILITADA=true
   PROMETHEUS_PORTA=9090
   ```

3. Incluir `compose.observabilidade.yml` na lista de arquivos Compose. O caminho padrão do `scripts/servidor/compose.sh` já inclui a sobreposição quando a variável está em `true`. Quando `COMPOSE_ARQUIVOS` está definida, acrescentar o arquivo à lista separada por `:`.
4. Recriar a pilha para a aplicação e o Prometheus receberem o token e o volume.
5. Executar um backup verificado para publicar a métrica de idade.

No perfil simples:

```bash
scripts/servidor/compose.sh up -d
```

No perfil com controlador adotado, a inclusão de um serviço novo altera a topologia e os hashes do ambiente. A reconfiguração restrita altera apenas os cinco seletores de rotina e não inclui `OBSERVABILIDADE_HABILITADA`, `PROMETHEUS_PORTA` nem o overlay. A mudança exige readoção revisada, conforme [controlador-manutencao.md](controlador-manutencao.md#observabilidade). Depois da readoção, a subida usa a entrada estável. O instalador não move o prefixo nem a trava ativa por conta própria.

### Habilitar o Alertmanager

O Alertmanager só sobe com o perfil `alertas` e com um receptor completo. Configurar o receptor no `ops.env` e subir o serviço:

```bash
scripts/servidor/compose.sh --profile alertas up -d alertmanager
```

O Prometheus já aponta para `alertmanager:9093` no bloco `alerting`. Com o perfil desligado, o alvo aparece fora do ar em `/targets`, mas nenhuma regra dispara por isso, porque não existe regra sobre `up{job="alertmanager"}`. Com o perfil ligado, conferir `up{job="alertmanager"}` em `1` e o alvo em `/targets`.

No perfil com controlador, a ativação do perfil altera o conjunto de serviços e deve ser tratada como mudança de topologia, com readoção revisada.

### Validar

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://frequencia.exemplo.br/api/metricas
ss -lntp | grep 9090
```

O primeiro comando deve devolver `404`, porque o proxy bloqueia a rota pública. O segundo deve mostrar `127.0.0.1:9090`, nunca `0.0.0.0:9090`.

Dentro do contêiner da aplicação, a coleta com o token do próprio ambiente confirma a rota:

```bash
scripts/servidor/compose.sh exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/metricas', { headers: { authorization: 'Bearer ' + process.env.METRICAS_TOKEN } }).then(async (r) => { console.log(r.status); console.log((await r.text()).slice(0, 200)); })"
```

A resposta deve começar com `200` e conter linhas `frequenciapp_`. O token não aparece na saída.

Os comandos com `scripts/servidor/compose.sh exec` valem para o perfil simples. No perfil com controlador, a entrada aceita apenas consultas como `ps` e `logs`; a inspeção direta com Docker é diagnóstico fora da garantia do controlador, conforme [controlador-manutencao.md](controlador-manutencao.md).

## Variáveis

| Variável                     | Arquivo | Padrão                                             | Uso                                                                                                                     |
| ---------------------------- | ------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `METRICAS_TOKEN`             | app.env | vazio                                              | Token Bearer da coleta. De 32 a 200 caracteres entre letras, números, hífen e sublinhado. Sem ele, a rota responde 404. |
| `OBSERVABILIDADE_HABILITADA` | ops.env | `false` em instalações existentes, `true` em novas | Inclui `compose.observabilidade.yml` no projeto Compose.                                                                |
| `PROMETHEUS_PORTA`           | ops.env | `9090`                                             | Porta do painel no loopback do host. Precisa estar livre e não é aberta no firewall.                                    |
| `ALERTA_WEBHOOK_URL`         | ops.env | vazio                                              | Receptor webhook do Alertmanager. Segredo. Exige `http://` ou `https://` e não aceita espaços.                          |
| `ALERTA_EMAIL_PARA`          | ops.env | vazio                                              | Destinatário do receptor de e-mail.                                                                                     |
| `ALERTA_EMAIL_DE`            | ops.env | vazio                                              | Remetente do receptor de e-mail.                                                                                        |
| `ALERTA_SMTP_SMARTHOST`      | ops.env | vazio                                              | Servidor SMTP no formato `host:porta`.                                                                                  |
| `ALERTA_SMTP_USUARIO`        | ops.env | vazio                                              | Usuário de autenticação do SMTP.                                                                                        |
| `ALERTA_SMTP_SENHA`          | ops.env | vazio                                              | Senha de autenticação do SMTP. Segredo.                                                                                 |

`METRICAS_TOKEN` é segredo. Gere com `openssl rand -hex 32` e mantenha o mesmo valor para a aplicação e para o Prometheus, que leem o mesmo `app.env`. A flag e a porta são configuração operacional.

Sem `METRICAS_TOKEN`, a rota responde 404. Com token diferente do configurado, responde 401. Com o token correto, responde 200.

O Alertmanager aceita apenas um receptor por vez: o webhook em `ALERTA_WEBHOOK_URL` ou o conjunto completo de `ALERTA_EMAIL_PARA`, `ALERTA_EMAIL_DE`, `ALERTA_SMTP_SMARTHOST`, `ALERTA_SMTP_USUARIO` e `ALERTA_SMTP_SENHA`. Com os dois configurados, ou com o conjunto de e-mail incompleto, o contêiner encerra com mensagem explícita e não inicia. O conjunto `ALERTA_*` é configuração sensível e fica no `ops.env` com modo 600 ou 640, fora do Git. O webhook e a senha SMTP são segredos de custódia equivalente à do token de métricas.

O receptor de e-mail usa TLS (`smtp_require_tls: true` e `require_tls: true`). O servidor SMTP precisa aceitar a autenticação e o remetente configurados.

## Catálogo de métricas

| Métrica                                                    | Tipo      | Labels                           | Unidade       | Uso                                         |
| ---------------------------------------------------------- | --------- | -------------------------------- | ------------- | ------------------------------------------- |
| `frequenciapp_build_info`                                  | gauge     | `version`, `revision`            | nenhuma       | Versão e commit em execução.                |
| `frequenciapp_http_requests_total`                         | counter   | `method`, `route`, `status`      | requisições   | Taxa de requisições e erros.                |
| `frequenciapp_http_request_duration_seconds`               | histogram | `method`, `route`                | segundos      | Latência da API.                            |
| `frequenciapp_http_requests_in_flight`                     | gauge     | nenhum                           | requisições   | Concorrência no processo.                   |
| `frequenciapp_db_pool_connections`                         | gauge     | `state`                          | conexões      | Saturação do pool do banco.                 |
| `frequenciapp_db_query_duration_seconds`                   | histogram | nenhum                           | segundos      | Latência das consultas ao banco.            |
| `frequenciapp_fila_planilha_itens`                         | gauge     | `estado`                         | itens         | Profundidade da fila de planilhas.          |
| `frequenciapp_fila_planilha_mais_antiga_timestamp_seconds` | gauge     | nenhum                           | segundos Unix | Idade da fila.                              |
| `frequenciapp_frequencias_salvas_total`                    | counter   | `resultado`                      | salvamentos   | Salvamentos e conflitos de revisão.         |
| `frequenciapp_fila_planilha_processados_total`             | counter   | `resultado`                      | itens         | Itens processados da fila de planilhas.     |
| `frequenciapp_notificacoes_enviadas_total`                 | counter   | `resultado`                      | avisos        | Avisos da agenda de notificações.           |
| `frequenciapp_coleta_erros_total`                          | counter   | `coletor`                        | erros         | Falhas de coleta por coletor.               |
| `frequenciapp_coleta_duracao_seconds`                      | gauge     | `coletor`                        | segundos      | Duração da coleta por coletor.              |
| `node_cpu_seconds_total`                                   | counter   | `cpu`, `mode`                    | segundos      | Tempo de CPU do host por modo.              |
| `node_load1`, `node_load5`, `node_load15`                  | gauge     | nenhum                           | carga         | Pressão de CPU do host.                     |
| `node_memory_MemAvailable_bytes`                           | gauge     | nenhum                           | bytes         | Memória disponível no host.                 |
| `node_memory_MemTotal_bytes`                               | gauge     | nenhum                           | bytes         | Memória total do host.                      |
| `node_filesystem_avail_bytes`                              | gauge     | `device`, `fstype`, `mountpoint` | bytes         | Espaço livre por sistema de arquivos.       |
| `node_filesystem_size_bytes`                               | gauge     | `device`, `fstype`, `mountpoint` | bytes         | Tamanho por sistema de arquivos.            |
| `probe_success`                                            | gauge     | `instance`, `job`                | 0 ou 1        | Resultado da sonda HTTPS.                   |
| `probe_ssl_earliest_cert_expiry`                           | gauge     | `instance`, `job`                | segundos Unix | Expiração do certificado TLS mais próximo.  |
| `alertmanager_notifications_failed_total`                  | counter   | `integration`, `reason`          | notificações  | Falhas de entrega por integração.           |
| `frequenciapp_backup_ultimo_sucesso_timestamp_seconds`     | gauge     | nenhum                           | segundos Unix | Instante do último backup verificado.       |
| `process_*`                                                | vários    | padrão do cliente                | várias        | CPU, memória, descritores e início.         |
| `nodejs_*`                                                 | vários    | padrão do cliente                | várias        | Heap, event loop, coletas de lixo e versão. |

Labels do pool: `total`, `idle`, `in_use` e `waiting`. O valor de `in_use` é a diferença entre `total` e `idle`.

Labels da fila: `AGUARDANDO`, `EM_ANDAMENTO`, `FALHOU`, `CONCLUIDO` e `DESCARTADO`. Em uma coleta bem-sucedida, os cinco estados aparecem, inclusive com zero. Quando a fila está vazia, o gauge da mais antiga vale `0`.

Labels do coletor: `pool` e `fila`.

Labels de resultado de frequência: `salvo` e `conflito`. Um salvamento recusado por revisão incrementa `conflito` e responde 409; erros de validação não alteram o contador. Labels de resultado da fila: `concluido` e `falha`. Labels de resultado das notificações: `enviada`, `expirada`, `falha` e `ignorada`. Nos resumos da fila e das notificações, os contadores só recebem incremento quando o valor é maior que zero.

O label `route` é um padrão, nunca o caminho com identificador. Por exemplo, `/api/alunos/<uuid>` vira `/api/alunos/:id`, datas viram `:dia`, números viram `:numero` e caminhos com mais de oito segmentos viram `/api/:rota-longa`. Fora de `/api/`, o valor é `fora-da-api`. Quando a leitura do cabeçalho falha, o valor é `desconhecida` e o método é `DESCONHECIDO`.

As métricas do node exporter são padrão do projeto e variam com a versão e com os coletores habilitados. O coletor de textfile acrescenta `node_textfile_mtime_seconds` e `node_textfile_scrape_error`; as métricas do arquivo de backup são publicadas sem prefixo adicional, como `frequenciapp_backup_ultimo_sucesso_timestamp_seconds`.

As métricas padrão do Node variam com a versão do cliente e do runtime. Entre as mais úteis estão `process_cpu_seconds_total`, `process_resident_memory_bytes`, `process_start_time_seconds`, `process_open_fds`, `nodejs_heap_size_used_bytes`, `nodejs_eventloop_lag_seconds`, `nodejs_gc_duration_seconds` e `nodejs_version_info`. Não dependa de uma lista fechada.

## Consultas úteis

Saúde da coleta:

```promql
up{job="frequenciapp"}
up{job="prometheus"}
up{job=~"node-exporter|blackbox|alertmanager"}
```

Taxa de requisições no total e por rota:

```promql
sum(rate(frequenciapp_http_requests_total[5m]))
```

```promql
sum by (route) (rate(frequenciapp_http_requests_total[5m]))
```

Proporção de respostas 5xx:

```promql
sum(rate(frequenciapp_http_requests_total{status=~"5.."}[5m]))
  /
sum(rate(frequenciapp_http_requests_total[5m]))
```

Latência p95 da API:

```promql
histogram_quantile(
  0.95,
  sum by (le) (rate(frequenciapp_http_request_duration_seconds_bucket[5m]))
)
```

Latência p95 das consultas ao banco:

```promql
histogram_quantile(
  0.95,
  sum by (le) (rate(frequenciapp_db_query_duration_seconds_bucket[5m]))
)
```

Pool de conexões por estado:

```promql
frequenciapp_db_pool_connections
```

Requisições aguardando conexão:

```promql
frequenciapp_db_pool_connections{state="waiting"}
```

Fila por estado:

```promql
frequenciapp_fila_planilha_itens
```

Idade do item aberto mais antigo, em segundos:

```promql
(time() - frequenciapp_fila_planilha_mais_antiga_timestamp_seconds)
  and on() (frequenciapp_fila_planilha_mais_antiga_timestamp_seconds > 0)
```

Salvamentos de frequência por resultado:

```promql
sum by (resultado) (rate(frequenciapp_frequencias_salvas_total[5m]))
```

Proporção de conflitos de revisão:

```promql
sum(rate(frequenciapp_frequencias_salvas_total{resultado="conflito"}[5m]))
  /
sum(rate(frequenciapp_frequencias_salvas_total[5m]))
```

Itens da fila de planilhas processados por resultado:

```promql
sum by (resultado) (rate(frequenciapp_fila_planilha_processados_total[5m]))
```

Notificações da agenda por resultado:

```promql
sum by (resultado) (rate(frequenciapp_notificacoes_enviadas_total[5m]))
```

Avisos enviados nas últimas 24 horas:

```promql
sum(increase(frequenciapp_notificacoes_enviadas_total{resultado="enviada"}[1d]))
```

Requisições em andamento:

```promql
frequenciapp_http_requests_in_flight
```

Falhas de coleta por coletor:

```promql
rate(frequenciapp_coleta_erros_total[5m])
```

Versão e commit em execução:

```promql
frequenciapp_build_info
```

Espaço livre por sistema de arquivos, em proporção:

```promql
(
  node_filesystem_avail_bytes{fstype!~"tmpfs|ramfs|overlay|squashfs",mountpoint!~"/var/lib/docker/.+"}
  /
  node_filesystem_size_bytes{fstype!~"tmpfs|ramfs|overlay|squashfs",mountpoint!~"/var/lib/docker/.+"}
)
```

Memória disponível, em proporção:

```promql
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
```

Dias até o certificado expirar:

```promql
(probe_ssl_earliest_cert_expiry{job="blackbox"} - time()) / 86400
```

Resultado da sonda HTTPS:

```promql
probe_success{job="blackbox"}
```

Idade do último backup verificado, em horas:

```promql
(time() - frequenciapp_backup_ultimo_sucesso_timestamp_seconds) / 3600
```

Falhas de notificação do Alertmanager:

```promql
rate(alertmanager_notifications_failed_total{job="alertmanager"}[10m])
```

## Kubernetes

O chart Helm de `infra/kubernetes/frequenciapp` também pode ser coletado pelo Prometheus Operator. A aplicação continua expondo `GET /api/metricas` com o mesmo token, e o chart oferece um `ServiceMonitor` opcional pela porta `http` do Service. O guia do chart está em [kubernetes.md](kubernetes.md).

```yaml
metrics:
  token: ""
  serviceMonitor:
    enabled: true
    interval: 30s
    scrapeTimeout: 10s
    labels:
      equipe: observabilidade
    bearerTokenSecret:
      name: ""
      key: METRICAS_TOKEN
```

- `metrics.serviceMonitor.enabled` vem desligado. Com `false`, o chart não renderiza o `ServiceMonitor` e nenhuma CRD é necessária.
- `metrics.serviceMonitor.interval` e `scrapeTimeout` usam a sintaxe de duração do Prometheus, com 30 e 10 segundos por padrão.
- `metrics.serviceMonitor.labels` acrescenta rótulos ao objeto. O seletor do Prometheus Operator precisa incluí-los para a coleta acontecer.
- `metrics.serviceMonitor.bearerTokenSecret.name` vazio usa o `existingSecret` ou o Secret gerenciado pelo chart. `bearerTokenSecret.key` tem `METRICAS_TOKEN` como padrão.

Com o Secret gerenciado, isto é, `secrets.create=true` e `existingSecret` vazio, preencher `metrics.token` com 32 a 200 caracteres entre letras, números, hífen e sublinhado. O chart grava a chave `METRICAS_TOKEN` no Secret. Com `existingSecret`, o chart não altera o Secret externo, e o operador precisa criar a chave `METRICAS_TOKEN` no Secret apontado por `existingSecret` ou em outro Secret indicado em `bearerTokenSecret.name`. Sem `secrets.create`, sem `existingSecret` e sem `bearerTokenSecret.name`, o template do ServiceMonitor falha por falta de Secret. Depois de alterar o Secret externo, atualizar `existingSecretRevision` para a aplicação reiniciar e passar a ler o token novo.

O `ServiceMonitor` exige o Prometheus Operator e a CRD `monitoring.coreos.com/v1`. O chart não instala nenhum dos dois. Sem a CRD, o `helm template` renderiza o objeto, mas o `kubectl apply` falha. Conferir a instalação com:

```bash
kubectl get crd servicemonitors.monitoring.coreos.com
```

A coleta usa a porta `http` do Service, o caminho `/api/metricas`, o intervalo e o tempo limite configurados, `authorization.type: Bearer` e `credentials` apontando para o Secret. O chart não publica a rota: o Ingress opcional encaminha `/` ao aplicativo e não cria regra para `/api/metricas`. O bloqueio na borda do cluster depende do Ingress controller ou de NetworkPolicy e não é automatizado pelo chart. A recomendação é bloquear a rota no Ingress ou restringir quem alcança a porta do aplicativo, sem criar regra pública para o caminho. Dentro do cluster, a rota continua exigindo o token: sem token configurado, responde 404; com token errado, 401.

## Retenção e volume

O Prometheus guarda 15 dias ou 1 GB, o que ocorrer primeiro. O limite fica em `infra/observabilidade/prometheus/prometheus.yml`, na seção `storage.tsdb.retention`. Alterar o valor exige reiniciar o serviço.

O volume nomeado `prometheus_data` pertence ao projeto Compose e guarda apenas o histórico de métricas. Ele não entra no backup do banco nem na cópia JSON da Gestão. Um `docker compose down -v` apaga o volume, e a coleta recomeça vazia. A decisão é intencional: o histórico serve para diagnóstico e não é fonte de verdade escolar.

O volume `alertmanager_data` guarda silêncios, estado de notificação e o registro de alertas do Alertmanager. Ele também não entra no backup. Silêncios e histórico de entrega podem ser descartados: a perda apenas faz o Alertmanager reenviar notificações pendentes e apagar os silêncios registrados. Remover o volume com o projeto parado é suficiente.

Para conferir o uso no perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus du -sh /prometheus
scripts/servidor/compose.sh --profile alertas exec -T alertmanager du -sh /alertmanager
```

## Painel e acesso

O painel do Prometheus não tem autenticação própria. Ele escuta somente no loopback do servidor, e o acesso acontece por túnel SSH:

```bash
ssh -L 9090:127.0.0.1:9090 usuario@servidor
```

Depois, abrir `http://localhost:9090` no navegador da estação. Com outra porta em `PROMETHEUS_PORTA`, ajustar o destino do túnel:

```bash
ssh -L 9090:127.0.0.1:9091 usuario@servidor
```

Páginas úteis:

- `/targets`: alvos, intervalo, último erro e saúde da coleta.
- `/alerts`: alertas ativos e pendentes.
- `/rules`: regras carregadas e expressões.
- `/graph`: consultas PromQL e gráficos temporários.

O Alertmanager não publica porta e é diagnosticado pelo próprio contêiner, com `amtool`:

```bash
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool alert query
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool silence query
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool check-config /tmp/alertmanager.yml
```

O healthcheck do contêiner usa, no perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus promtool check healthy --url=http://127.0.0.1:9090
```

Não abrir o painel no firewall nem publicá-lo em Caddy, Nginx ou CDN. A ausência de autenticação e o conteúdo operacional tornam o loopback o único limite aceitável.

## Alertas

As onze regras ficam em `infra/observabilidade/prometheus/regras.yml`.

| Alerta                                     | Condição                                                     | Tempo  | Gravidade |
| ------------------------------------------ | ------------------------------------------------------------ | ------ | --------- |
| `FrequenciappIndisponivel`                 | `up{job="frequenciapp"} == 0`                                | 2 min  | critical  |
| `FrequenciappErros5xx`                     | Proporção de 5xx acima de 5% no intervalo de 5 minutos.      | 10 min | warning   |
| `FrequenciappLatenciaP95`                  | p95 acima de 5 segundos no intervalo de 5 minutos.           | 10 min | warning   |
| `FrequenciappPoolAguardando`               | `frequenciapp_db_pool_connections{state="waiting"} > 0`.     | 10 min | warning   |
| `FrequenciappFilaPlanilhaParada`           | Item aberto mais antigo acima de 1 hora, com fila não vazia. | 10 min | warning   |
| `FrequenciappDiscoBaixo`                   | Espaço livre abaixo de 15% em um sistema de arquivos.        | 15 min | warning   |
| `FrequenciappMemoriaBaixa`                 | Memória disponível abaixo de 10% no host.                    | 10 min | warning   |
| `FrequenciappSondaHttps`                   | `probe_success{job="blackbox"} == 0`.                        | 5 min  | critical  |
| `FrequenciappCertificadoExpirando`         | Certificado expira em menos de 14 dias.                      | 1 h    | warning   |
| `FrequenciappAlertmanagerFalhaNotificacao` | Falha de notificação no receptor nos últimos 10 minutos.     | 10 min | warning   |
| `FrequenciappBackupAtrasado`               | Último backup verificado há mais de 24 horas.                | 1 h    | warning   |

As cinco primeiras regras vêm da fase 1 e cobrem a aplicação. A fase 2 acrescentou as regras de disco e memória, as duas de sonda e certificado, a de falha de notificação e a de atraso do backup.

A entrega depende do Alertmanager, que é opt-in. O bloco `alerting` do `prometheus.yml` aponta para `alertmanager:9093`; o Alertmanager agrupa por `alertname`, espera 30 segundos para o primeiro envio, repete o grupo a cada 5 minutos e reenvia um alerta ainda ativo a cada 4 horas. As notificações de resolução também são enviadas, porque o receptor usa `send_resolved: true`.

Sem o perfil `alertas`, os alertas aparecem em `/alerts` e em `/rules`, mas não geram e-mail, webhook nem notificação push. O `NOTIFICAR_URL` do cron continua cobrindo apenas as rotinas do servidor, não as regras do Prometheus.

O estado `pending` indica que a condição está verdadeira e o tempo mínimo ainda não passou. O estado `firing` indica que o alerta está ativo.

### Testar a entrega

Com o perfil ligado e um receptor configurado, enviar um alerta sintético pelo `amtool` dentro do contêiner:

```bash
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool alert add FrequenciappTeste severity=warning \
  --annotation=resumo="Alerta de teste da observabilidade"
```

O `amtool` usa `http://localhost:9093` por padrão, que é o próprio Alertmanager dentro do contêiner. Conferir o alerta com:

```bash
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool alert query
```

A entrega pode levar até o `group_wait` de 30 segundos. O receptor deve receber a notificação com o rótulo `alertname="FrequenciappTeste"`.

Para resolver o alerta sintético, enviar o mesmo alerta com `--end` no passado:

```bash
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool alert add FrequenciappTeste severity=warning \
  --end=2020-01-01T00:00:00-03:00
```

Como o receptor usa `send_resolved: true`, a resolução também é notificada.

### Desligar

1. Configurar `ALERTA_WEBHOOK_URL` e o conjunto `ALERTA_EMAIL_*` como vazios no `ops.env`.
2. Parar o serviço com o perfil: `scripts/servidor/compose.sh --profile alertas stop alertmanager`.
3. Subir a pilha sem o perfil, para o serviço não ser recriado.
4. Opcionalmente, remover o volume `alertmanager_data` com o projeto parado. O volume guarda apenas silêncios e estado de notificação.

O restante da observabilidade continua funcionando. O alvo `alertmanager:9093` volta a aparecer fora do ar em `/targets`, sem disparo de regra.

## Segurança

- `/api/metricas` exige `Authorization: Bearer` com o token configurado. A comparação usa `timingSafeEqual`.
- O token tem de 32 a 200 caracteres, fica no `app.env` com modo 600 e não aparece no `prometheus.yml`, em labels, em logs ou em mensagens do instalador.
- O entrypoint do Prometheus valida o formato e o comprimento do token, aplica `umask 077` e grava `/tmp/metricas-token` com permissão restrita.
- O Prometheus fica apenas na rede `interna`, sem portas publicadas e sem saída para a internet.
- O node exporter monta o sistema de arquivos do host somente leitura em `/host`, usa `pid: host` e roda com `cap_drop: ALL` e `no-new-privileges`.
- O blackbox exporter não recebe credenciais. A sonda usa `/api/saude`, que é pública por projeto, e não envia token.
- O receptor do Alertmanager fica apenas no `ops.env`, fora do Git. O webhook e a senha SMTP são segredos.
- O entrypoint do Alertmanager aplica `umask 077`, grava a configuração gerada em `/tmp/alertmanager.yml`, valida com `amtool check-config` e não exibe a saída do `amtool` para não registrar valores do receptor.
- O Alertmanager entra na rede `publica` apenas para alcançar o webhook ou o SMTP. Não há porta publicada, e o acesso ao serviço continua restrito às redes do projeto.
- A ponte `prometheus-ui` publica somente `127.0.0.1:${PROMETHEUS_PORTA:-9090}` e encaminha apenas para `prometheus:9090`. Ela roda sem privilégios, com `cap_drop: ALL`, `no-new-privileges` e sistema de arquivos somente leitura.
- Caddy e Nginx respondem 404 para `/api/metricas` antes do proxy. O bloqueio público não depende do token.
- No cluster, o ServiceMonitor lê o token do Secret pelo campo `credentials`. Com `existingSecret`, o chart não altera o Secret externo e a chave `METRICAS_TOKEN` é responsabilidade do operador.
- O chart não instala o Prometheus Operator nem a CRD `monitoring.coreos.com/v1`. Habilitar o ServiceMonitor sem a CRD faz a aplicação do manifesto falhar, e o token não é criado automaticamente fora do Secret gerenciado.
- O Ingress opcional do chart encaminha `/` ao aplicativo. O bloqueio de `/api/metricas` na borda depende do Ingress controller ou de NetworkPolicy e não é automatizado pelo chart.
- O Prometheus inicia sem lifecycle e sem admin API. Não há recarga remota nem exclusão de dados por HTTP. Alterar configuração exige reiniciar o contêiner.
- O token de backup acompanha o `app.env` cifrado quando `BACKUP_INCLUIR_AMBIENTE=true`. O arquivo de backup precisa do mesmo cuidado de um segredo.
- Para trocar o token, gerar outro, atualizar o `app.env` e recriar a aplicação e o Prometheus. No perfil com controlador, a recriação passa pela entrada estável. A coleta fica indisponível até os dois lados usarem o mesmo valor.
- Nenhum label recebe nome, matrícula, e-mail, identificador de aluno, identificador de turma, código de escola, SQL ou conteúdo de requisição.

## LGPD

As métricas são operacionais, locais e agregadas. Elas registram requisições por padrão de rota, status, duração, conexões do pool, latência de consultas, contagens da fila, salvamentos de frequência, conflitos de revisão, itens processados e avisos da agenda. Também registram CPU, memória, disco, sistemas de arquivos, disponibilidade da sonda HTTPS, validade do certificado, falhas de notificação e o instante do último backup verificado. Não contêm dados de alunos, de contas ou de escolas.

O Prometheus roda na infraestrutura da escola, sem telemetria de terceiros. O histórico de 15 dias fica no volume `prometheus_data`, e o Alertmanager guarda silêncios e estado de notificação em `alertmanager_data`. Os dois volumes ficam fora do backup e podem ser descartados sem perda de dados escolares. O painel é restrito ao loopback e ao túnel SSH do operador.

No cluster, a coleta usa o mesmo endpoint autenticado e o token do Secret. As séries continuam operacionais e agregadas, sem dados de alunos, contas ou escolas, e o histórico fica no Prometheus do cluster, fora do backup do chart.

O detalhamento do tratamento de dados está em [lgpd.md](lgpd.md).

## Diagnóstico

### Alvo fora do ar

Quando `up{job="frequenciapp"}` vale `0`:

1. Conferir `scripts/servidor/compose.sh ps` e a saúde do serviço `app`.
2. Conferir `curl -fsS http://127.0.0.1:3000/api/saude` dentro da rede.
3. Conferir se a aplicação e o Prometheus estão na rede `interna` e se o alvo é `app:3000`.
4. Conferir o último erro do alvo em `/targets`.

### Coleta com 401

O token da aplicação e o token do Prometheus divergem. Conferir `METRICAS_TOKEN` em `/etc/frequenciapp/app.env`, recriar os dois serviços e confirmar que o arquivo `/tmp/metricas-token` foi regravado.

### Coleta com 404

Um 404 no alvo `frequenciapp` indica que a aplicação está sem `METRICAS_TOKEN`. A rota responde 404 de propósito quando o token não está configurado. Um 404 no domínio público é o comportamento esperado do proxy e não é falha.

### Fila parada

1. Conferir `frequenciapp_fila_planilha_itens` e a idade em `/alerts`.
2. Conferir a agenda do servidor em [auto-hospedagem.md](auto-hospedagem.md).
3. Conferir `frequenciapp_coleta_erros_total{coletor="fila"}`.
4. Conferir a Fila de envios na Gestão e os logs da aplicação.

### Sonda HTTPS falhando

1. Conferir `probe_success{job="blackbox"}` e o último erro do alvo `blackbox` em `/targets`.
2. Conferir se o `DOMINIO` está correto em `/etc/frequenciapp/ops.env` e se o proxy declara o alias `proxy` na rede `publica`.
3. Conferir se o Caddy ou o Nginx responde `200` em `/api/saude` por dentro da rede.
4. Conferir `probe_http_status_code` e `probe_duration_seconds` para separar recusa, tempo limite e status inesperado.
5. Em TLS interno, conferir se a CA da escola está montada e configurada em `ca_file` no `blackbox.yml`. Sem esse ajuste, a validação do certificado falha mesmo com o serviço no ar.
6. Conferir os logs com `scripts/servidor/compose.sh logs --tail 200 blackbox-exporter`.

### Certificado expirando

1. Conferir a consulta de dias restantes e `probe_ssl_earliest_cert_expiry` em `/graph`.
2. Conferir a data no cliente externo, sem desativar a validação TLS.
3. No Caddy, conferir a renovação automática e os logs do proxy.
4. No Nginx, executar `scripts/servidor/renovar-certificado.sh --dry-run` e conferir o cron da renovação.
5. Em TLS interno, renovar o certificado na CA da escola e substituir os arquivos do Nginx ou a raiz do Caddy.

### Disco e memória

1. Conferir `node_filesystem_avail_bytes` e `node_memory_MemAvailable_bytes` em `/graph`.
2. Conferir `df -h` e `free -m` no host.
3. Conferir o crescimento de `/var/lib/docker`, dos volumes, dos logs e do diretório de backup.
4. As regras ignoram `tmpfs`, `ramfs`, `overlay` e `squashfs`, e também `/var/lib/docker` aninhado. Um sistema de arquivos ausente da consulta não dispara o alerta.

### Backup atrasado

1. Conferir `(time() - frequenciapp_backup_ultimo_sucesso_timestamp_seconds) / 3600` em `/graph`.
2. Conferir `/var/lib/frequenciapp/ultimo-backup.json` e o arquivo `/var/lib/frequenciapp/metricas/ultimo-backup.prom`.
3. Se a métrica não existir, nenhum backup verificado foi concluído desde a instalação. Conferir o cron, o `MAILTO` e os logs da rotina de backup.
4. Conferir `BACKUP_*`, a chave de cifra e o destino remoto em [backup-servidor.md](backup-servidor.md).
5. A rotina publica o arquivo no fim de um backup verificado e em uma verificação sem `--sem-escrita`. A falha de escrita gera aviso no log e não falha o backup.

### Alertmanager sem entregar

1. Conferir se o perfil `alertas` está ativo e se `up{job="alertmanager"}` vale `1`.
2. Conferir `scripts/servidor/compose.sh --profile alertas exec alertmanager amtool alert query` e a lista de silêncios.
3. Conferir `scripts/servidor/compose.sh --profile alertas exec alertmanager amtool check-config /tmp/alertmanager.yml`.
4. Conferir `rate(alertmanager_notifications_failed_total{job="alertmanager"}[10m])` e os rótulos `integration` e `reason` com falha.
5. Conferir os logs com `scripts/servidor/compose.sh --profile alertas logs --tail 200 alertmanager`.
6. Conferir o webhook ou o servidor SMTP, a autenticação, a porta e a saída de rede pela rede `publica`.
7. Um alerta silenciado não é notificado. Conferir a lista de silêncios antes de concluir que a entrega falhou.

### Validar configuração e regras

No perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
scripts/servidor/compose.sh exec -T prometheus promtool check rules /etc/prometheus/regras.yml
scripts/servidor/compose.sh --profile alertas exec alertmanager amtool check-config /tmp/alertmanager.yml
```

A validação do repositório roda as mesmas conferências com as imagens fixadas:

```bash
pnpm run servidor:validar
```

### Logs

```bash
scripts/servidor/compose.sh logs --tail 200 prometheus
scripts/servidor/compose.sh logs --tail 100 prometheus-ui
scripts/servidor/compose.sh logs --tail 200 node-exporter
scripts/servidor/compose.sh logs --tail 200 blackbox-exporter
scripts/servidor/compose.sh --profile alertas logs --tail 200 alertmanager
```

O log do Prometheus mostra falhas de coleta, erros de configuração e a inicialização. O log da ponte mostra conexões aceitas e recusadas. Os logs dos exporters mostram falhas de montagem, de sonda e de entrega.

### Painel não abre

1. Conferir se o túnel SSH está ativo e se a porta local não está ocupada.
2. Conferir `ss -lntp | grep 9090` no servidor.
3. Conferir `PROMETHEUS_PORTA` e o destino do túnel.
4. Conferir se o firewall não bloqueia a porta local da estação.

### Disco e volume

No perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus du -sh /prometheus
docker system df
```

O limite de 1 GB evita crescimento indefinido. Se o volume crescer acima do esperado, conferir a cardinalidade na página de status do TSDB e o `sample_limit` da coleta.

## Limitações

- A aplicação é um único processo. As métricas refletem essa instância, sem agregação entre réplicas.
- Os contadores de domínio são incrementados por processo. Com mais de uma réplica, cada Pod expõe a própria contagem, e o total depende da agregação do Prometheus. Reiniciar o processo zera os contadores.
- Não há métricas de página, de navegador, de latência de renderização nem de service worker.
- Os histogramas são clássicos, com buckets fixos. O p95 é aproximado, e a agregação entre rotas diferentes perde precisão.
- O label `route` é normalizado. Rotas fora do padrão aparecem como `desconhecida` ou `fora-da-api`.
- O `sample_limit` de 20000 falha a coleta inteira quando a cardinalidade explode, em vez de entregar dados parciais.
- O Alertmanager é opt-in. Sem o perfil `alertas` e um receptor, os alertas ficam apenas no painel.
- O receptor de e-mail depende do servidor SMTP da escola, da autenticação e do TLS. Uma indisponibilidade do servidor impede a entrega mesmo com o Alertmanager saudável.
- Em TLS interno, o blackbox precisa da CA da escola montada e de `ca_file` no `blackbox.yml`. Sem esse ajuste, a sonda falha na validação do certificado.
- A métrica de idade do backup só existe depois de um backup verificado. Antes do primeiro backup, a regra `FrequenciappBackupAtrasado` não dispara por ausência da série.
- O alvo `alertmanager:9093` fica fora do ar em `/targets` quando o perfil está desligado. Não há regra sobre esse alvo, então a condição não gera notificação.
- O painel não tem autenticação. O acesso depende do loopback e do túnel SSH.
- O histórico não é copiado no backup. Recriar o volume perde os 15 dias anteriores.
- O node exporter não substitui os logs do Docker nem o journal do sistema.
- O ServiceMonitor exige o Prometheus Operator e a CRD `monitoring.coreos.com/v1`. O chart não instala nenhum dos dois, e a coleta no cluster não funciona apenas com o chart.
- Com `existingSecret`, a chave `METRICAS_TOKEN` precisa ser criada fora do Helm. O chart não altera o Secret externo nem cria a chave em um Secret existente.
- O Ingress opcional do chart encaminha `/` ao aplicativo. O chart não bloqueia `/api/metricas` na borda, o que depende do Ingress controller ou de NetworkPolicy.
- O ServiceMonitor só é selecionado se os rótulos do objeto, incluindo os de `metrics.serviceMonitor.labels`, estiverem cobertos pelo seletor do Prometheus Operator. Um ServiceMonitor sem correspondência no seletor não gera coleta.

## Fases entregues

As três fases da observabilidade estão disponíveis:

- Fase 1: registro, métricas HTTP, pool, consultas e fila, endpoint autenticado, Prometheus na rede interna, painel no loopback e bloqueio no proxy.
- Fase 2: node exporter, blackbox exporter, Alertmanager opt-in, regras de disco, memória, TLS, certificado e idade do último backup.
- Fase 3: contadores de frequências, fila e notificações, além do ServiceMonitor opcional no chart Helm para clusters com Prometheus Operator.

## Referências

- [ADR-079: observabilidade com Prometheus](adr/079-observabilidade-com-prometheus.md)
- [Auto-hospedagem](auto-hospedagem.md)
- [Backup do servidor](backup-servidor.md)
- [Segurança](seguranca.md)
- [LGPD](lgpd.md)
- [Operação](operacao.md)
- [Prometheus: configuração](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus: retenção](https://prometheus.io/docs/prometheus/latest/storage/)
- [Prometheus: consultas](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Blackbox exporter](https://github.com/prometheus/blackbox_exporter)
- [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/)
