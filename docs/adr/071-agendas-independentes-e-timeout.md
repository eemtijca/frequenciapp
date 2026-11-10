# ADR-071: agendas independentes e timeout por requisição

## Estado

Implementada para revisão.

## Contexto

A agenda agrupada chamava notificações, fila de planilhas e indicadores sempre na mesma execução. A configuração não permitia desligar uma rotina sem desligar as demais, um valor de timeout inválido interrompia o processo e os consumidores de servidor, Kubernetes e GitHub Actions não expunham os mesmos controles. A issue #415 registrou o risco de uma rotina impedir as outras e de efeitos externos não intencionais.

## Decisão

- `AGENDA_NOTIFICACOES`, `AGENDA_PLANILHAS` e `AGENDA_INDICADORES` são booleanos textuais estritos. Ausência conserva `true`, os únicos valores aceitos são `true` e `false` e todos desligados encerram sem exigir `CRON_SECRET`.
- Cada rota habilitada usa uma requisição própria, com cabeçalho `Authorization: Bearer` e um `AbortSignal.timeout` criado para aquela chamada. Falha, resposta HTTP de erro ou timeout somam uma falha e não interrompem as rotas seguintes.
- `AGENDA_TIMEOUT` aceita inteiro positivo de 1 a 2147483 segundos. `AGENDA_URL` aceita apenas HTTP ou HTTPS e normaliza a barra final.
- O wrapper do servidor passa `AGENDA_URL`, `AGENDA_TIMEOUT` e os três seletores por `compose exec -e`. O Compose e o Compose de CI declaram os mesmos valores no serviço da aplicação.
- O chart Helm expõe `agenda.notifications`, `agenda.spreadsheets`, `agenda.indicators`, `agenda.timeoutSeconds` e `agenda.appUrl`. Os valores são validados no template e injetados no CronJob.
- Os workflows mantêm URLs próprias: `NOTIFICACOES_APP_URL` para notificações e `FILA_APP_URL`, com fallback para a primeira, na fila. Cada passo respeita o seletor correspondente e o passo de indicadores usa `always()` sem ignorar o seletor.

## Alternativas consideradas

### Um CronJob ou workflow por rotina

Separar cada rotina em um agendador próprio daria isolamento de infraestrutura, mas multiplicaria segredos, horários e pontos de falha. A execução agrupada com seletores e requisições independentes mantém uma única configuração e ainda permite desligar cada efeito.

### Um único interruptor para toda a agenda

Desligar todas as funções resolveria o efeito externo indesejado, mas impediria manter notificações enquanto a fila está em manutenção. Os três seletores preservam essa operação parcial.

### Confiar no timeout do cliente HTTP

Sem validar `AGENDA_TIMEOUT`, valores vazios, negativos ou acima do limite de temporizador do Node encerrariam a agenda inteira. A validação falha antes de qualquer chamada e mantém o erro explícito.

## Consequências

### Positivas

- Uma rotina desligada não recebe chamadas e não impede as demais.
- Uma falha ou timeout em uma rota não cancela as seguintes.
- Servidor, Kubernetes e Actions usam os mesmos nomes e a mesma semântica.
- O timeout inválido falha antes de efeitos externos.

### Negativas e riscos

- A agenda continua sendo um único processo; uma falha de configuração que atinja a leitura do ambiente encerra todas as rotinas antes do primeiro pedido.
- O valor do timeout é comum às três rotinas, com um temporizador por requisição e ajuste apenas por inteiro de segundos.
- Desligar uma rotina não limpa reservas, itens de fila ou dados já gravados.
- Mais de uma agenda ativa de indicadores pode duplicar trabalho; a operação deve escolher servidor, Kubernetes ou Actions.

## Testes

- `tests/unidade/infra/agenda.test.ts` exercita as oito combinações, autenticação, falha isolada e timeout real com servidor HTTP local, sem rede externa.
- `tests/kubernetes/validar.sh` renderiza as oito combinações, valida o timeout, a URL e o fuso, além das recusas de backup sem persistência.
- O workflow `Servidor` executa o ensaio do chart e o `actionlint`.
