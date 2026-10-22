# ADR-052: envio automático com simulação única e acesso guardado

## Estado

Aceita. Complementa a [ADR-025](025-envio-automatico-ao-salvar.md) e a [ADR-050](050-limite-de-leitura-da-planilha.md).

## Contexto

Cada chamada salva com o envio automático ligado custava 22 etapas de rede em sequência quando criava a coluna do dia: 7 renovações do token de acesso, uma por ação, 14 leituras e a escrita. O plano era montado duas vezes sob a trava, a segunda só para comparar o hash, e a releitura da estrutura depois da escrita fazia duas ações com quatro leituras de tamanho e de células, duas de cada. Com as leituras do processo em fila e o teto local de 45 por minuto da ADR-050, o número de leituras por envio passou a limitar quantas turmas chegam à planilha por minuto.

## Decisão

- O servidor guarda em memória o token de acesso renovado, pela impressão do token cifrado, até cinco minutos antes do vencimento informado pelo Google, com no máximo 20 entradas. Sem validade na resposta, nada é guardado. Qualquer falha numa ação descarta o acesso guardado; uma ação que só lê e é recusada com ele é repetida uma única vez com um acesso novo, e escritas nunca são repetidas. Picker, diagnóstico e reconexão continuam renovando a cada uso.
- O envio automático relê a integração, monta o plano uma vez e aplica esse mesmo plano, tudo sob a trava, o cache do documento e o orçamento de leitura. A conferência do último `PARCIAL`, a recusa de plano que não seja seguro e o limite de envios valem sobre esse plano. O hash continua obrigatório no envio manual, entre a prévia e a confirmação. A ADR-025 previa o mesmo hash também no automático; sem prévia humana, a comparação só refazia a leitura.
- A releitura da estrutura usa uma ação só, `detectarAba`, com um documento, um tamanho e uma leitura das células, e entrega o mesmo esquema que a conferência de estrutura seguida da leitura.

## Consequências

- O envio com coluna nova cai para 11 etapas, 10 leituras e a escrita, e o teto de 45 leituras por minuto comporta cerca de quatro envios e meio, contra três.
- A releitura da aba imediatamente antes do lote, o registro `PARCIAL` antes da escrita e a recusa de plano inseguro não mudam.
- Uma revogação feita direto na conta Google só é percebida quando o Google recusa o acesso guardado; no pior caso, perto de uma hora depois. Desconectar ou reconectar pela Gestão troca o token cifrado e vale na hora.
- A memória é por processo: em serverless, cada instância renova uma vez.
