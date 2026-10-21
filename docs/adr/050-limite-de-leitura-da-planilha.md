# ADR-050: limite de leitura da planilha

## Estado

Aceito.

## Contexto

O envio de um mês com várias abas repetia a leitura do documento, do tamanho e das células em cada aba, na prévia e de novo na gravação. A fila automática fazia o mesmo trabalho ao mesmo tempo. A cota de leituras por minuto do Google recusava o restante das abas. A interface tratava essa recusa, ocorrida antes de escrever, como confirmação perdida. Uma marca já igual continuava pendente quando o sucesso registrava células puladas, e uma divergência no período impedia confirmar os dias limpos.

## Decisão

A prévia da frequência lê os valores de todas as abas do envio em duas consultas. As leituras do processo seguem uma fila. Dentro da prévia, do envio e da organização, a fila espera ao chegar a 45 leituras no último minuto. HTTP 429 de leitura espera com prazo informado pelo Google ou com pausa que dobra, mais uma folga aleatória, no máximo cinco vezes e nunca acima de um minuto. Escritas não são repetidas. Prévia, envio manual e fila da frequência usam a mesma trava.

Marca igual não é gravada de novo. Sucesso sem célula pulada confirma o período. Sucesso com divergência confirma só os dias limpos, cada um com o instante da leitura. Fórmula, valor diferente e resposta perdida depois da escrita continuam exigindo conferência. O reenvio não sobrescreve célula ocupada e não apaga conteúdo.

## Consequências

O envio de várias turmas cabe na cota de leituras. O painel deixa de contar como pendente o dia cuja marca já está na planilha. Dia com valor diferente permanece pendente. Não há migração. A trava e a fila valem por processo; entre instâncias, a trava da frequência e a pausa do HTTP 429 evitam a sobreposição dos envios da frequência. O teto local de 45 leituras por minuto pode ser ajustado por `GOOGLE_LEITURAS_POR_MINUTO`; o CI usa um valor alto porque o dublê da Sheets API não aplica cota.
