# Fila de processamento

Guia operacional da fila genérica de trabalhos e do transporte BullMQ. A decisão está na [ADR-085](adr/085-fila-de-processamento-com-redis-e-bullmq.md). A fila FIFO de planilhas continua descrita em [planilha.md](planilha.md) e nas ADR-039 e ADR-074.

## Princípio

O PostgreSQL é a fonte da verdade. O Redis é transporte e temporizador. Nenhum dado de aluno entra no payload, no log ou em label de métrica.

```text
Next.js -> PostgreSQL -> dispatcher -> Redis/BullMQ -> worker
             ^                                         |
             +-----------------------------------------+
```

## Filas

| Fila BullMQ | Concorrência inicial | Conteúdo                                 |
| ----------- | -------------------- | ---------------------------------------- |
| `planilha`  | 1                    | Cabeça da fila FIFO de planilhas         |
| `trabalhos` | 1 ou 2               | Indicadores, preparação mensal e expurgo |

O prefixo `{frequenciapp}` mantém a compatibilidade com Redis Cluster. Ele pode ser trocado por `BULLMQ_PREFIX`, sempre entre chaves; os testes usam `{frequenciapp-teste}` e recusam limpar um prefixo que não contenha `teste`. Os jobs guardam somente o identificador do trabalho ou da planilha.

## Trabalhos genéricos

| Tipo                       | Gatilho                | Fila        | Tentativas | Efeito externo |
| -------------------------- | ---------------------- | ----------- | ---------- | -------------- |
| `INDICADORES_ATUALIZAR`    | Administração e agenda | `trabalhos` | 5          | Google Sheets  |
| `PLANILHA_MENSAL_PREPARAR` | Administração          | `trabalhos` | 5          | Google Sheets  |
| `EXPURGO_TRABALHOS`        | Agenda diária          | `trabalhos` | 3          | Nenhum         |

Estados:

```text
PENDENTE -> DISPONIVEL -> EM_EXECUCAO -> CONCLUIDO
                              |
                              +-> AGUARDANDO -> DISPONIVEL
                              |
                              +-> FALHOU
                              |
                              +-> CONFERENCIA
```

- `PENDENTE`: intenção gravada, ainda não publicada.
- `DISPONIVEL`: publicada ou pronta para reserva.
- `EM_EXECUCAO`: reservada por um worker.
- `AGUARDANDO`: falha segura com nova tentativa agendada.
- `CONCLUIDO`: terminou.
- `FALHOU`: falha definitiva ou tentativas esgotadas.
- `CONFERENCIA`: efeito externo incerto, exige conferência.
- `CANCELADO`: cancelado pela administração antes de começar.

Quando a reserva de um trabalho vence sem finalização, o reconciliador aplica uma política por tipo:

| Tipo                       | Destino       |
| -------------------------- | ------------- |
| `INDICADORES_ATUALIZAR`    | `AGUARDANDO`  |
| `EXPURGO_TRABALHOS`        | `AGUARDANDO`  |
| `PLANILHA_MENSAL_PREPARAR` | `CONFERENCIA` |
| Tipo desconhecido          | `FALHOU`      |

A atualização usa fencing por estado, reserva e prazo. Um heartbeat ou uma reserva renovada por outro worker nunca é sobrescrito. A conferência resultante é encerrada em `POST /api/trabalhos/{id}/resolver`, com decisão `concluido` ou `falhou`, e o encerramento fica na auditoria.

Falha de publicação no Redis não encerra o trabalho. A intenção permanece `PENDENTE` ou `AGUARDANDO`, com `tentativasDespacho`, `erroDespacho` e um novo `proximoDespachoEm` limitado a cinco minutos. A interface mostra o selo Aguardando publicação. Quando o Redis volta, o mesmo trabalho é publicado sem passar por `FALHOU`.

## Fila de planilhas

- A ordem continua em `fila_planilha.sequencia`.
- O pump publica somente a cabeça, com `jobId` de três partes: identificador e tentativa, ou identificador e o instante da reserva no formato `r<timestamp>`.
- O worker chama `processarFila` e, ao terminar, publica a próxima cabeça.
- `attempts` do BullMQ é 1. A retentativa segura continua em `src/domain/fila-planilha.ts`.
- `sem_confirmacao` não é repetido.
- A reserva é estendida a cada 60 segundos.
- A agenda de cinco minutos e o botão Processar agora continuam como fallback.

## Configuração

```text
FILA_DRIVER=redis
FILA_PLANILHA_TRANSPORTE=bullmq
FILA_TRABALHOS_HABILITADA=true
REDIS_URL=redis://:senha@redis:6379/0
WORKER_PORTA=3001
WORKER_CONCORRENCIA=2
WORKER_PLANILHA_CONCORRENCIA=1
WORKER_TIMEOUT=240
WORKER_SHUTDOWN_TIMEOUT=30
```

O caminho simples usa:

```text
FILA_DRIVER=postgres
FILA_PLANILHA_TRANSPORTE=direto
FILA_TRABALHOS_HABILITADA=false
```

A validação em `src/infra/ambiente.ts` recusa `FILA_DRIVER=redis` sem `REDIS_URL`, `FILA_PLANILHA_TRANSPORTE=bullmq` sem o driver Redis e `FILA_TRABALHOS_HABILITADA=true` sem o driver Redis.

## Compose

O overlay `compose.fila.yml` sobe `redis` e `worker`, sem portas publicadas. O Redis e o banco ficam apenas na rede `interna`. O worker entra em `interna` e em `publica`, porque precisa alcançar o OAuth e a Sheets API; a rede `publica` é a única com saída no servidor. O `app` recebe `REDIS_URL` e as flags. O worker usa a mesma imagem, com `node dist/worker.mjs`, `read_only`, `/tmp` em tmpfs e encerramento gracioso de 60 segundos.

As flags do overlay usam interpolação, então o rollback altera a configuração efetiva:

```text
FILA_DRIVER=redis
FILA_PLANILHA_TRANSPORTE=bullmq
FILA_TRABALHOS_HABILITADA=true
```

O worker só cria a fila de planilhas com `FILA_PLANILHA_TRANSPORTE=bullmq` e a fila de trabalhos com `FILA_TRABALHOS_HABILITADA=true`, sempre com `FILA_DRIVER=redis`. Sem filas compatíveis, o processo fica saudável e ocioso, sem consumir jobs.

No servidor auto-hospedado, definir `FILA_HABILITADA=true` no `ops.env` e `REDIS_PASSWORD` no `app.env`. Com `COMPOSE_ARQUIVOS` explícita, incluir `compose.fila.yml`; sem a lista, o overlay entra automaticamente quando a flag está ligada. No perfil controlador, a mudança de topologia exige readoção revisada.

## Redis

- `appendonly yes`.
- `appendfsync everysec`.
- `maxmemory-policy noeviction`.
- `maxmemory` com folga.
- Senha obrigatória.
- Rede interna.
- AOF e volume não entram no backup do banco.
- Se o Redis for perdido, recriar o volume e reiniciar o worker. O PostgreSQL reconstrói a fila.

## Worker

- `GET /saude`: 200 quando PostgreSQL e Redis respondem.
- `GET /metricas`: métricas Prometheus com `METRICAS_TOKEN`.
- `SIGTERM` e `SIGINT`: para de buscar, aguarda os jobs ativos e fecha as conexões.
- O worker não aplica migrações e não serve páginas.
- O build usa `pnpm run build:worker`, que gera `dist/worker.mjs`.
- `WORKER_TIMEOUT` encerra a espera pelo manipulador e leva o trabalho para `CONFERENCIA` com código `timeout`. O sinal de cancelamento é entregue ao manipulador, mas só interrompe de fato quem observa o `AbortSignal`; a propagação para as chamadas Google é uma evolução separada.

## Agendas

Com a fila de trabalhos habilitada, o worker registra três Job Schedulers:

| Scheduler          | Intervalo   | Função                                                            |
| ------------------ | ----------- | ----------------------------------------------------------------- |
| `reconciliar-fila` | 1 minuto    | recupera reservas vencidas, despacha pendentes e publica a cabeça |
| `indicadores-fila` | 5 minutos   | grava `INDICADORES_ATUALIZAR` com janela de cinco minutos         |
| `expurgo-diario`   | 03:00 local | grava `EXPURGO_TRABALHOS` com chave por dia                       |

A janela e o dia entram no payload apenas como chave de idempotência; não são dado pessoal. A rota `/api/indicadores/agenda` também grava o trabalho, em vez de atualizar os indicadores no processo web. Quando a fila de trabalhos está desligada, a rota mantém o caminho direto e a agenda externa continua funcionando.

## Operação

Verificações:

```bash
docker compose -f compose.yml -f compose.servidor.yml -f compose.fila.yml ps
docker compose logs -f worker
curl -fsS http://127.0.0.1:3001/saude
```

Consultas no banco:

```sql
select estado, count(*) from trabalhos group by estado;
select estado, count(*) from fila_planilha group by estado;
select id, tipo, reservado_por, reservado_ate
from trabalhos
where estado = 'EM_EXECUCAO' and reservado_ate < now();
```

Problemas comuns:

- **Worker não processa**: conferir Redis, logs e `/saude`; rodar Processar agora.
- **Redis fora**: a API continua; os itens ficam no PostgreSQL, marcados como Aguardando publicação; subir o Redis e aguardar a reconciliação. Nenhum trabalho vira `FALHOU` só porque o transporte caiu.
- **Item preso**: conferir `reservado_ate` e o heartbeat; o reconciliador recupera a reserva vencida. Não editar a reserva à mão.
- **Conferência**: abrir a Gestão, conferir a planilha e usar Concluir ou Marcar falha. Não reenviar sem confirmação.
- **Duplicata**: conferir `jobId`, `chave_idempotencia` e os logs; registrar issue sem dados de aluno.

Processar agora responde diferente conforme o transporte:

- Com BullMQ, devolve `despachado: true` e contagens zeradas; a interface informa que a fila foi publicada e o worker continua em segundo plano.
- No caminho direto, processa até 20 itens e devolve o resumo com `despachado: false`. A agenda continua com limite de 50.

## Rollback

O rollback principal remove o overlay da topologia. No `ops.env`, definir `FILA_HABILITADA=false` e subir sem `compose.fila.yml`; o app volta ao caminho PostgreSQL mais cron e o worker e o Redis deixam de existir. Não apagar o Redis nem a tabela. A migração é aditiva e não precisa ser revertida.

O rollback parcial mantém o overlay, altera as flags no ambiente e recria o app:

```text
FILA_PLANILHA_TRANSPORTE=direto
FILA_TRABALHOS_HABILITADA=false
```

Com essas flags, o worker não consome nenhuma fila. A agenda e o botão Processar agora assumem. Para encerrar o worker de vez no rollback parcial, usar `docker compose stop worker`. As duas formas precisam passar por `docker compose config` antes da subida.

## Testes

```bash
pnpm run test:unit
pnpm exec vitest run --config vitest.fila.config.ts
pnpm run test:api
pnpm run test:e2e:docker
pnpm run format:check
pnpm run lint
pnpm run tsc
```

O ensaio de integração exige PostgreSQL migrado e Redis. O CI usa um banco descartável e o prefixo `{frequenciapp-teste}`; a limpeza recusa qualquer prefixo que não contenha `teste`. Nenhum teste usa dados reais.
