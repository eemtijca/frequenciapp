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

O prefixo `{frequenciapp}` mantém a compatibilidade com Redis Cluster. Os jobs guardam somente o identificador do trabalho ou da planilha.

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

## Fila de planilhas

- A ordem continua em `fila_planilha.sequencia`.
- O pump publica somente a cabeça, com `jobId` formado por identificador e tentativa.
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

A validação em `src/infra/ambiente.ts` recusa `FILA_DRIVER=redis` sem `REDIS_URL` e `FILA_PLANILHA_TRANSPORTE=bullmq` sem o driver Redis.

## Compose

O overlay `compose.fila.yml` sobe `redis` e `worker` na rede interna, sem portas publicadas. O `app` recebe `REDIS_URL` e as flags. O worker usa a mesma imagem, com `node dist/worker.mjs`, `read_only`, `/tmp` em tmpfs e encerramento gracioso de 60 segundos.

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
- **Redis fora**: a API continua; os itens ficam no PostgreSQL; subir o Redis e aguardar a reconciliação.
- **Item preso**: conferir `reservado_ate` e o heartbeat; não editar a reserva à mão.
- **Conferência**: abrir a Gestão, conferir a planilha e resolver. Não reenviar sem confirmação.
- **Duplicata**: conferir `jobId`, `chave_idempotencia` e os logs; registrar issue sem dados de aluno.

## Rollback

```text
FILA_PLANILHA_TRANSPORTE=direto
FILA_TRABALHOS_HABILITADA=false
```

Reiniciar o app. A agenda e o botão Processar agora assumem. Não apagar o Redis nem a tabela. A migração é aditiva e não precisa ser revertida.

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

O ensaio de integração exige PostgreSQL migrado e Redis. O CI usa um banco descartável e o prefixo de teste. Nenhum teste usa dados reais.
