# ADR-069: intenção escolar e conferência da fila

Estado: aceita. Data: 2026-11-10.

## Contexto

A [ADR-039](039-fila-fifo-dos-envios-automaticos.md) criou a fila FIFO durável, mas o registro escolar era confirmado antes do enfileiramento. Se a gravação da fila falhasse entre o commit e o despacho, o envio automático sumia sem item recuperável. A fila também tratava resultados diferentes como um único encerramento: plano sem mapa, falha de preparo e escrita sem confirmação ficavam fora da lista ou sem ação clara. Por fim, a finalização de um item filtrava apenas identificador e estado, então um consumidor com reserva vencida podia concluir a reserva assumida por outro processo.

## Decisão

- O salvamento de frequência, inclusive a justificativa que corrige chamada salva, o registro de saída e o registro de entrada gravam uma intenção mínima na mesma transação do registro escolar. A intenção contém tipo, identificador do evento, revisão, dia, turma e autor, sem nome de aluno nem conteúdo de planilha.
- Um dispatcher separado, em outra transação, transforma a intenção em item da fila, funde o item igual que ainda aguarda e confirma o recibo. Falha no dispatcher preserva a intenção para a agenda ou para o botão Processar agora. A agenda e o processamento manual executam o dispatcher antes de consumir a fila.
- O resultado do item distingue sucesso, falha de preparo, origem não processada, pendência segura e conferência de escrita incerta. Falha de preparo e origem não processada geram nova tentativa automática; mapa ausente, plano que pede conferência manual e autor removido ficam visíveis com a ação Tentar novamente.
- O item guarda `requer_conferencia`, o instante da tentativa, os destinos alcançados e o código curto da falha de preparo. Resultado `sem_confirmacao` não é repetido automaticamente e não entra no expurgo comum.
- A rota `POST /api/planilha/fila/{id}/resolver` encerra a conferência sem reenviar dados. Quando o escopo está completo e o destino é conhecido, exige um registro de sucesso posterior no mesmo destino, turma e período, sem células ocupadas ou fórmulas puladas. Recorte antigo, incompleto ou sem destino exige confirmação explícita, registrada na auditoria.
- A aquisição da reserva compara a contagem de tentativas e a finalização compara a contagem e o prazo reservado. Um consumidor vencido não altera o estado nem conta o item como processado.

## Alternativas

Manter o enfileiramento depois do commit deixa a janela de perda. Gravar a intenção sempre, mesmo com a integração desligada, acumularia envios que nunca deveriam sair e poderia disparar histórico antigo ao ligar a automação. Um serviço de fila externo acrescentaria infraestrutura que a Vercel Hobby e o Docker simples não têm. Resolver a escrita incerta por confirmação simples, sem evidência, esconderia uma possível divergência na planilha.

## Consequências

- O registro escolar e a intenção compartilham o mesmo commit. Uma falha ao gravar a intenção impede o registro, em vez de perder o envio.
- Intenções pendentes sobrevivem a reinícios e são retomadas pela agenda ou pelo processamento manual.
- A resolução de escrita incerta depende de um sucesso posterior no mesmo escopo. Enquanto isso não acontece, o item permanece visível e fora do expurgo.
- Recortes antigos, incompletos ou sem destino usam confirmação explícita. A confirmação não substitui a evidência de um destino conhecido.
- A reserva impede que o consumidor vencido finalize o item do novo dono, mas não cancela uma escrita já iniciada no Google. A garantia continua sendo de recuperação e de conferência, não de exatamente uma vez.
- A migração `20261109112215_l07_outbox_escolar_e_conferencia` precisa ser aplicada antes da nova versão.

## Referências

- [ADR-025](025-envio-automatico-ao-salvar.md)
- [ADR-039](039-fila-fifo-dos-envios-automaticos.md)
- [ADR-050](050-limite-de-leitura-da-planilha.md)
- [ADR-052](052-envio-automatico-com-simulacao-unica.md)
