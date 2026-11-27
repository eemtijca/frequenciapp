# ADR-088: aprovação agendada de migrações

## Estado

Proposta.

## Contexto

O atualizador agendado exige aprovação humana para cada lote de migrações. A via manual não deve ser repetida pelo cron. É possível automatizar um subconjunto aditivo sem delegar ao código candidato o poder de aprovar a própria aplicação nem dispensar a recuperação comprovada.

## Decisão

- O controlador adota uma política opcional, desativada por padrão e armazenada no `ops.env` privado. Alterá-la exige a operação administrativa sob a mesma trava. A via manual, o manifesto por lote e o canal `release` não passam a aprovar migrações automaticamente.
- A revisão confiável inventaria os SQLs do próximo commit da `main`. Aceita somente novas migrações aditivas reconhecidas e exige que o GitHub Actions tenha ensaiado a mesma base e o lote exato em PostgreSQL 17 descartável. O código e os insumos do ensaio não podem mudar nesse lote.
- O atualizador compara a revisão servida, a imagem, o servidor e o histórico do PostgreSQL. Antes da troca, fixa um novo backup cifrado cujo recibo identifica a origem do dump e reconfirma seus artefatos e o ensaio de recuperação. A aprovação fica vinculada ao pin, à imagem e ao lote no journal protegido.
- Na partida, o migrador confere a conexão e o histórico sob travas. A escrita exige a autorização efêmera correspondente ao lote, montada somente para leitura. Migrações e histórico são confirmados juntos. A autorização é removida antes de restaurar o reinício normal: uma restauração da base não autoriza o contêiner a reescrevê-la.
- O sucesso exige saúde da revisão com consulta ao modelo do aplicativo, histórico final exato e conclusão durável. Uma recusa comprovada antes da troca não bloqueia a próxima execução. Depois da aprovação, efeitos incertos bloqueiam novas mutações e preservam o pin; não há rollback automático de imagem ou banco.

## Alternativas

- Um manifesto para todo lote preserva a decisão humana, mas exige intervenção para mudanças aditivas já ensaiadas. Continua disponível fora da política automática.
- Um sinal de CI verde não basta: um check de pull request ou de outro SHA não prova o upgrade da revisão efetiva. O ensaio também não substitui um backup recuperável da instalação.
- Reutilizar a aprovação dentro do contêiner permitiria que uma partida posterior aplicasse novamente o SQL após uma restauração. O journal e a autorização de partida têm ciclos de vida distintos.

## Consequências

A opção não instala o cron. Atualizações acumuladas sem prova do intervalo exato e desvios de configuração, histórico, transporte ou versão exigem avaliação manual. A adoção da revisão e a ativação na instalação são decisões separadas. Desativar a política impede novas aprovações, sem cancelar ou desfazer lote iniciado.

## Referências

- [Auto-hospedagem](../auto-hospedagem.md)
- [Controlador de manutenção](../controlador-manutencao.md)
- [Backup do servidor](../backup-servidor.md)
- [ADR-065: atualização e recuperação verificáveis](065-atualizacao-e-recuperacao-verificaveis.md)
- [ADR-078: reconfiguração restrita das rotinas](078-reconfiguracao-restrita-das-rotinas.md)
