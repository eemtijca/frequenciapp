# ADR-085: fila de processamento com Redis e BullMQ

Estado: aceita. Data: 2026-11-28.

## Contexto

A fila de planilhas da ADR-039 já era durável, FIFO e testada, mas o processamento automático continuava no processo web por `after()` e pela agenda de cinco minutos. Os trabalhos longos de planilha ocupavam requisições de até 300 segundos, competiam com a API pelo pool do PostgreSQL e pelo limitador de leitura do Google, e não havia uma fila genérica para indicadores e preparação mensal.

O projeto passou a ter a VPS com Docker Compose como destino de produção. A Vercel ficou como preview ou desligada. Isso permitiu um worker dedicado e um serviço Redis na rede interna, sem abandonar o caminho simples da Vercel.

## Decisão

- O PostgreSQL continua sendo a fonte da verdade. A intenção, o estado, a reserva, o resultado, a conferência e a auditoria ficam no banco.
- O Redis com BullMQ é transporte e temporizador. O Redis não guarda dado de aluno, não decide retentativa e não substitui a tabela `fila_planilha`.
- A tabela `fila_planilha`, a UI, as métricas e as regras da ADR-039 e da ADR-074 permanecem. O que muda é o transporte e o consumidor.
- Um worker dedicado em `src/worker.ts` consome a fila de planilhas e a fila genérica de trabalhos. O processo web não processa trabalhos longos.
- A fila genérica usa a tabela `trabalhos`, com `chave_idempotencia`, estados explícitos, reserva com `reserva_id`, heartbeat e retentativa segura.
- O BullMQ usa `attempts: 1`. A política de retentativa continua em `src/domain/fila-planilha.ts` e em `src/domain/trabalho.ts`.
- A fila de planilhas publica somente a cabeça no BullMQ. A ordem continua sendo `fila_planilha.sequencia`, preservando o FIFO estrito.
- O worker estende a reserva a cada 60 segundos e só finaliza com o fencing de `reserva_id` ou de `tentativas` mais `reservadoAte`.
- A aplicação não depende do Redis para responder. Se o Redis estiver fora, a intenção fica no PostgreSQL e o dispatcher ou a agenda recupera.
- O caminho simples continua disponível com `FILA_DRIVER=postgres` e `FILA_PLANILHA_TRANSPORTE=direto`. A Vercel e os previews usam esse caminho.
- O chart Helm não instala Redis. O serviço é externo ao chart ou fornecido pelo Compose.
- O worker não aplica migrações. A aplicação ou o Job de migração continua sendo o único proprietário do schema.

## Alternativas

Manter o processamento no `after()` e na agenda deixaria a API sujeita a trabalhos longos e sem uma fila genérica. Usar RabbitMQ acrescentaria Erlang, cluster de três nós para alta disponibilidade e um modelo de job que ainda precisaria ser projetado no PostgreSQL. Usar Redis Streams exigiria reimplementar retentativa, atraso, agendamento e painel. Usar o BullMQ com backend PostgreSQL evitaria o Redis, mas não substituiria a máquina de estados da fila de planilhas e aumentaria a pressão no mesmo banco. Remover `fila_planilha` agora perderia a transação com o registro escolar e a conferência de escrita incerta.

## Consequências

- A operação ganha um serviço stateful, o Redis, e um processo, o worker.
- O Redis entra na rede interna, sem porta pública, com AOF, `noeviction` e senha.
- O worker precisa de saúde, métricas, encerramento gracioso e limites de memória.
- A VPS precisa incluir `compose.fila.yml` e a variável `REDIS_PASSWORD`.
- O perfil controlador trata a fila como mudança de topologia e exige readoção revisada.
- O Redis não entra no backup do banco. A recuperação é reconstruir a fila a partir do PostgreSQL.
- A fila de planilhas mantém a semântica de escrita incerta e não repete `sem_confirmacao`.
- A fila genérica começa com indicadores e preparação mensal. Novos tipos exigem catálogo, payload, handler e teste.
- A agenda de cinco minutos continua como fallback por pelo menos uma versão.
- A Vercel e os previews continuam no caminho PostgreSQL mais cron.

## Referências

- [ADR-036](036-implantacao-multinuvem.md)
- [ADR-039](039-fila-fifo-dos-envios-automaticos.md)
- [ADR-064](064-auto-hospedagem-servidor.md)
- [ADR-074](074-outbox-escolar-e-conferencia-da-fila.md)
- [ADR-079](079-observabilidade-com-prometheus.md)
- [Fila de processamento](../fila-processamento.md)
- [BullMQ: going to production](https://docs.bullmq.io/guide/going-to-production)
- [Redis: persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
