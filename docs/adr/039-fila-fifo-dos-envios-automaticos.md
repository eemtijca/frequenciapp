# ADR-039: fila FIFO durável dos envios automáticos às planilhas

Estado: aceita. Data: 2026-10-07.

## Contexto

O envio automático à planilha (ao salvar a chamada e ao registrar saídas e entradas) rodava em `after()` no mesmo processo. A ordem dependia de uma promessa em memória, que não vale entre instâncias, e um envio que falhava ou era interrompido por reinício não deixava registro para ser tentado de novo: a situação `falhou` desaparecia depois da resposta.

## Decisão

- A tabela `fila_planilha` guarda um item por envio automático, com `sequencia` autoincremental (define a ordem FIFO), tipo (`FREQUENCIA`, `SAIDAS`, `ENTRADAS`), estado (`AGUARDANDO`, `EM_ANDAMENTO`, `CONCLUIDO`, `FALHOU`, `DESCARTADO`), dia, turma quando há, autor, tentativas, próxima tentativa e reserva com prazo. Não guarda nome de aluno nem dado de planilha.
- As rotas de frequência, saídas e entradas enfileiram antes de responder, só com a integração ativa, o envio automático ligado e o modo conservador, e disparam o processamento em `after()`. Um item igual que já aguarda a vez absorve o novo, porque o envio lê o estado atual do aplicativo.
- O processamento pega sempre o item aberto de menor sequência e o reserva por cinco minutos com um `UPDATE` condicional, o que garante um consumidor por vez entre instâncias. Reserva vencida volta a ser tentada. Os remetentes existentes (`enviarAposSalvar`, `enviarSaidasAposRegistro`, `enviarEntradasAposRegistro`) são reaproveitados sem mudança, com seus planos, hashes e `emSequencia`.
- Só a falha confirmada gera nova tentativa, com esperas de 30 segundos, 2, 10 e 30 minutos, até cinco tentativas. Esgotadas, o item vai a `FALHOU` e a fila segue. Envio sem confirmação (`sem_confirmacao`), plano que pede conferência manual, falta de mapa e integração desligada encerram o item sem repetir, porque repetir um envio que pode ter escrito na planilha não é seguro.
- Enquanto o item da frente espera a próxima tentativa ou está reservado, os de trás aguardam: a ordem é estrita.
- Uma rota de agenda (`GET /api/planilha/fila/agenda`), autenticada por `CRON_SECRET`, recolhe o que sobrou; o workflow `fila-planilha.yml` a chama a cada cinco minutos, no mesmo padrão das notificações. Não há variável de ambiente nova.
- A Gestão mostra contagens por estado e os itens recentes, e permite processar agora, descartar o que aguarda e reenfileirar o que falhou ou foi descartado, com auditoria.
- Itens concluídos são apagados depois de sete dias; falhos e descartados, depois de trinta.
- Os envios manuais com prévia ficam fora da fila.

## Alternativas

Manter `after()` e a promessa em memória deixa a perda silenciosa e a ordem sem garantia entre instâncias. Um serviço de fila externo (SQS, Redis, pg-boss) acrescentaria dependência e infraestrutura que a Vercel Hobby e o Docker simples não têm. Pular o item em espera e seguir adiante evita bloquear, mas troca a ordem das linhas na planilha e foi descartado para os casos de espera curta; o bloqueio é limitado pelas cinco tentativas.

## Consequências

- Nenhum envio automático some por reinício ou falha temporária do Google; falhas esgotadas ficam visíveis e recuperáveis na Gestão.
- Uma planilha fora do ar segura a fila por até cerca de 43 minutos antes de o item ser dado como falho.
- A agenda depende do segredo `CRON_SECRET` no repositório e do GitHub Actions, que pode atrasar; sem agenda, a fila é esvaziada pela tentativa imediata e pelo botão Processar agora.
- O limitador de envios por conta (30 a cada 15 minutos) continua valendo e, ao ser atingido, vira falha confirmada com nova tentativa, em vez de perda.
- A migração `fila_planilha` precisa ser aplicada em produção pelo workflow de migrações.
