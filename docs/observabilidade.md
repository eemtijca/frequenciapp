# Observabilidade

Guia da coleta Prometheus do FrequenciApp na auto-hospedagem. A aplicação expõe métricas operacionais em `/api/metricas`, e o Prometheus as coleta pela rede interna do Compose. A decisão está na [ADR-079](adr/079-observabilidade-com-prometheus.md).

## O que é observado

- Requisições HTTP da API: contagem por método, rota e status, duração e requisições em andamento.
- Pool de conexões do PostgreSQL, latência das consultas e falhas de coleta.
- Fila de envio às planilhas: itens por estado e idade do item aberto mais antigo.
- Processo Node.js: CPU, memória, descritores de arquivo, event loop, coletas de lixo e versão do runtime.
- Saúde da coleta: o alvo `frequenciapp` e o próprio Prometheus.

Não são observados páginas, navegador, service worker, dados de alunos, conteúdo de requisição, SQL nem parâmetros de consulta.

## Arquitetura

```text
Caddy ou Nginx (80 e 443)
        |
        v
   app:3000  (redes interna e publica)
        ^
        |  GET /api/metricas  (Bearer METRICAS_TOKEN)
        |
   prometheus:9090  (somente rede interna)
        |
        +--> volume prometheus_data
        +--> prometheus-ui (socat, ponte TCP)
                 |
                 +--> 127.0.0.1:9090 (painel, acesso por túnel SSH)
```

- O proxy recebe a requisição pública e responde 404 para `/api/metricas` antes de encaminhar ao aplicativo.
- `src/proxy.ts` injeta `x-frequenciapp-rota` e `x-frequenciapp-metodo` nas demais rotas de API. `executarRota` mede a duração, captura o status e registra a métrica.
- A rota não entra na especificação OpenAPI pública e não usa `executarRota`, para não se autoinstrumentar.
- O Prometheus coleta `http://app:3000/api/metricas` a cada 30 segundos, com tempo limite de 10 segundos e avaliação das regras a cada 30 segundos.
- O token fica em `app.env`. O entrypoint do Prometheus grava o valor em `/tmp/metricas-token`, com permissão restrita, e o `prometheus.yml` apenas referencia o arquivo.
- O Prometheus fica somente na rede `interna`, sem portas publicadas e sem saída para a internet.
- O Docker não publica portas de um contêiner ligado apenas a uma rede `internal`. Por isso a ponte `prometheus-ui` publica `127.0.0.1:${PROMETHEUS_PORTA:-9090}` e encaminha somente para `prometheus:9090`. A ponte não aceita destino arbitrário.
- O volume nomeado `prometheus_data` guarda o histórico do Prometheus.

## Como habilitar

A observabilidade é opt-in. Instalações novas já nascem com ela ligada; instalações existentes sem a variável continuam sem Prometheus até uma decisão explícita.

### Instalação nova

O instalador grava o token e as variáveis operacionais. Depois da instalação:

1. Conferir `METRICAS_TOKEN` em `/etc/frequenciapp/app.env`, com modo 600.
2. Conferir `OBSERVABILIDADE_HABILITADA=true` e `PROMETHEUS_PORTA=9090` em `/etc/frequenciapp/ops.env`.
3. Conferir que os serviços `prometheus` e `prometheus-ui` estão no projeto Compose.
4. Abrir o painel pelo túnel descrito em [Painel e acesso](#painel-e-acesso) e conferir o alvo `frequenciapp` em `/targets`.

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

No perfil simples:

```bash
scripts/servidor/compose.sh up -d
```

No perfil com controlador adotado, a inclusão de um serviço novo altera a topologia e os hashes do ambiente. A reconfiguração restrita altera apenas os cinco seletores de rotina e não inclui `OBSERVABILIDADE_HABILITADA`, `PROMETHEUS_PORTA` nem o overlay. A mudança exige readoção revisada, conforme [controlador-manutencao.md](controlador-manutencao.md#observabilidade). Depois da readoção, a subida usa a entrada estável. O instalador não move o prefixo nem a trava ativa por conta própria.

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

`METRICAS_TOKEN` é segredo. Gere com `openssl rand -hex 32` e mantenha o mesmo valor para a aplicação e para o Prometheus, que leem o mesmo `app.env`. A flag e a porta são configuração operacional.

Sem `METRICAS_TOKEN`, a rota responde 404. Com token diferente do configurado, responde 401. Com o token correto, responde 200.

## Catálogo de métricas

| Métrica                                                    | Tipo      | Labels                      | Unidade       | Uso                                         |
| ---------------------------------------------------------- | --------- | --------------------------- | ------------- | ------------------------------------------- |
| `frequenciapp_build_info`                                  | gauge     | `version`, `revision`       | nenhuma       | Versão e commit em execução.                |
| `frequenciapp_http_requests_total`                         | counter   | `method`, `route`, `status` | requisições   | Taxa de requisições e erros.                |
| `frequenciapp_http_request_duration_seconds`               | histogram | `method`, `route`           | segundos      | Latência da API.                            |
| `frequenciapp_http_requests_in_flight`                     | gauge     | nenhum                      | requisições   | Concorrência no processo.                   |
| `frequenciapp_db_pool_connections`                         | gauge     | `state`                     | conexões      | Saturação do pool do banco.                 |
| `frequenciapp_db_query_duration_seconds`                   | histogram | nenhum                      | segundos      | Latência das consultas ao banco.            |
| `frequenciapp_fila_planilha_itens`                         | gauge     | `estado`                    | itens         | Profundidade da fila de planilhas.          |
| `frequenciapp_fila_planilha_mais_antiga_timestamp_seconds` | gauge     | nenhum                      | segundos Unix | Idade da fila.                              |
| `frequenciapp_coleta_erros_total`                          | counter   | `coletor`                   | erros         | Falhas de coleta por coletor.               |
| `frequenciapp_coleta_duracao_seconds`                      | gauge     | `coletor`                   | segundos      | Duração da coleta por coletor.              |
| `process_*`                                                | vários    | padrão do cliente           | várias        | CPU, memória, descritores e início.         |
| `nodejs_*`                                                 | vários    | padrão do cliente           | várias        | Heap, event loop, coletas de lixo e versão. |

Labels do pool: `total`, `idle`, `in_use` e `waiting`. O valor de `in_use` é a diferença entre `total` e `idle`.

Labels da fila: `AGUARDANDO`, `EM_ANDAMENTO`, `FALHOU`, `CONCLUIDO` e `DESCARTADO`. Em uma coleta bem-sucedida, os cinco estados aparecem, inclusive com zero. Quando a fila está vazia, o gauge da mais antiga vale `0`.

Labels do coletor: `pool` e `fila`.

O label `route` é um padrão, nunca o caminho com identificador. Por exemplo, `/api/alunos/<uuid>` vira `/api/alunos/:id`, datas viram `:dia`, números viram `:numero` e caminhos com mais de oito segmentos viram `/api/:rota-longa`. Fora de `/api/`, o valor é `fora-da-api`. Quando a leitura do cabeçalho falha, o valor é `desconhecida` e o método é `DESCONHECIDO`.

As métricas padrão do Node variam com a versão do cliente e do runtime. Entre as mais úteis estão `process_cpu_seconds_total`, `process_resident_memory_bytes`, `process_start_time_seconds`, `process_open_fds`, `nodejs_heap_size_used_bytes`, `nodejs_eventloop_lag_seconds`, `nodejs_gc_duration_seconds` e `nodejs_version_info`. Não dependa de uma lista fechada.

## Consultas úteis

Saúde da coleta:

```promql
up{job="frequenciapp"}
up{job="prometheus"}
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

## Retenção e volume

O Prometheus guarda 15 dias ou 1 GB, o que ocorrer primeiro. O limite fica em `infra/observabilidade/prometheus/prometheus.yml`, na seção `storage.tsdb.retention`. Alterar o valor exige reiniciar o serviço.

O volume nomeado `prometheus_data` pertence ao projeto Compose e guarda apenas o histórico de métricas. Ele não entra no backup do banco nem na cópia JSON da Gestão. Um `docker compose down -v` apaga o volume, e a coleta recomeça vazia. A decisão é intencional: o histórico serve para diagnóstico e não é fonte de verdade escolar.

Para conferir o uso no perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus du -sh /prometheus
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

O healthcheck do contêiner usa, no perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus promtool check healthy --url=http://127.0.0.1:9090
```

Não abrir o painel no firewall nem publicá-lo em Caddy, Nginx ou CDN. A ausência de autenticação e o conteúdo operacional tornam o loopback o único limite aceitável.

## Alertas

As cinco regras da fase 1 ficam em `infra/observabilidade/prometheus/regras.yml`.

| Alerta                           | Condição                                                     | Tempo  | Gravidade |
| -------------------------------- | ------------------------------------------------------------ | ------ | --------- |
| `FrequenciappIndisponivel`       | `up{job="frequenciapp"} == 0`                                | 2 min  | critical  |
| `FrequenciappErros5xx`           | Proporção de 5xx acima de 5% no intervalo de 5 minutos.      | 10 min | warning   |
| `FrequenciappLatenciaP95`        | p95 acima de 5 segundos no intervalo de 5 minutos.           | 10 min | warning   |
| `FrequenciappPoolAguardando`     | `frequenciapp_db_pool_connections{state="waiting"} > 0`.     | 10 min | warning   |
| `FrequenciappFilaPlanilhaParada` | Item aberto mais antigo acima de 1 hora, com fila não vazia. | 10 min | warning   |

A fase 1 não tem Alertmanager. Os alertas aparecem em `/alerts` e em `/rules`, mas não geram e-mail, webhook nem notificação push. A verificação exige abrir o painel pelo túnel SSH. O `NOTIFICAR_URL` do cron continua cobrindo apenas as rotinas do servidor, não as regras do Prometheus.

O estado `pending` indica que a condição está verdadeira e o tempo mínimo ainda não passou. O estado `firing` indica que o alerta está ativo.

## Segurança

- `/api/metricas` exige `Authorization: Bearer` com o token configurado. A comparação usa `timingSafeEqual`.
- O token tem de 32 a 200 caracteres, fica no `app.env` com modo 600 e não aparece no `prometheus.yml`, em labels, em logs ou em mensagens do instalador.
- O entrypoint do Prometheus valida o formato e o comprimento do token, aplica `umask 077` e grava `/tmp/metricas-token` com permissão restrita.
- O Prometheus fica apenas na rede `interna`, sem portas publicadas e sem saída para a internet.
- A ponte `prometheus-ui` publica somente `127.0.0.1:${PROMETHEUS_PORTA:-9090}` e encaminha apenas para `prometheus:9090`. Ela roda sem privilégios, com `cap_drop: ALL`, `no-new-privileges` e sistema de arquivos somente leitura.
- Caddy e Nginx respondem 404 para `/api/metricas` antes do proxy. O bloqueio público não depende do token.
- O Prometheus inicia sem lifecycle e sem admin API. Não há recarga remota nem exclusão de dados por HTTP. Alterar configuração exige reiniciar o contêiner.
- O token de backup acompanha o `app.env` cifrado quando `BACKUP_INCLUIR_AMBIENTE=true`. O arquivo de backup precisa do mesmo cuidado de um segredo.
- Para trocar o token, gerar outro, atualizar o `app.env` e recriar a aplicação e o Prometheus. No perfil com controlador, a recriação passa pela entrada estável. A coleta fica indisponível até os dois lados usarem o mesmo valor.
- Nenhum label recebe nome, matrícula, e-mail, identificador de aluno, identificador de turma, código de escola, SQL ou conteúdo de requisição.

## LGPD

As métricas são operacionais, locais e agregadas. Elas registram requisições por padrão de rota, status, duração, conexões do pool, latência de consultas e contagens da fila. Não contêm dados de alunos, de contas ou de escolas.

O Prometheus roda na infraestrutura da escola, sem telemetria de terceiros. O histórico de 15 dias fica no volume `prometheus_data`, que não entra no backup e pode ser descartado sem perda de dados escolares. O painel é restrito ao loopback e ao túnel SSH do operador.

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

### Validar configuração e regras

No perfil simples:

```bash
scripts/servidor/compose.sh exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
scripts/servidor/compose.sh exec -T prometheus promtool check rules /etc/prometheus/regras.yml
```

A validação do repositório roda a mesma conferência com a imagem fixada:

```bash
pnpm run servidor:validar
```

### Logs

```bash
scripts/servidor/compose.sh logs --tail 200 prometheus
scripts/servidor/compose.sh logs --tail 100 prometheus-ui
```

O log do Prometheus mostra falhas de coleta, erros de configuração e a inicialização. O log da ponte mostra conexões aceitas e recusadas.

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
- Não há métricas de página, de navegador, de latência de renderização nem de service worker.
- Os histogramas são clássicos, com buckets fixos. O p95 é aproximado, e a agregação entre rotas diferentes perde precisão.
- O label `route` é normalizado. Rotas fora do padrão aparecem como `desconhecida` ou `fora-da-api`.
- O `sample_limit` de 20000 falha a coleta inteira quando a cardinalidade explode, em vez de entregar dados parciais.
- A fase 1 não tem Alertmanager, então não há notificação externa.
- A fase 1 não mede disco, memória do host, TLS, certificado nem idade do backup.
- O painel não tem autenticação. O acesso depende do loopback e do túnel SSH.
- O histórico não é copiado no backup. Recriar o volume perde os 15 dias anteriores.

## Próximas fases

Estes itens não estão disponíveis na fase 1:

- node exporter para CPU, memória, disco e sistemas de arquivos do host;
- blackbox exporter para HTTPS, `/api/saude` e validade do certificado;
- Alertmanager para envio de alertas por webhook ou e-mail;
- métrica da idade do último backup verificado;
- ServiceMonitor opcional no chart Helm, para clusters com Prometheus Operator;
- contadores de frequência, fila processada e notificações enviadas.

O detalhamento das fases seguintes fica nas próximas ADRs e nos guias de operação.

## Referências

- [ADR-079: observabilidade com Prometheus](adr/079-observabilidade-com-prometheus.md)
- [Auto-hospedagem](auto-hospedagem.md)
- [Segurança](seguranca.md)
- [LGPD](lgpd.md)
- [Operação](operacao.md)
- [Prometheus: configuração](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus: retenção](https://prometheus.io/docs/prometheus/latest/storage/)
- [Prometheus: consultas](https://prometheus.io/docs/prometheus/latest/querying/basics/)
