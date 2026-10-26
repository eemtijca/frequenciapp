# ADR-058: domingo sem novos registros

- Status: aceita
- Data: 2026-10-25

## Contexto

A Chamada e a Chamada Parcial já recusavam domingo, mas Saídas e Entradas ainda aceitava criar registros nessa data. O calendário de segunda a domingo passou a destacar o domingo como resumo, o que tornaria confuso oferecer o formulário de saída ou entrada no mesmo dia. A regra precisa olhar a data alvo, não o dia corrente, para que um domingo de trabalho não bloqueie o sábado nem os dias anteriores.

## Decisão

- Criar ou alterar chamada, saída ou entrada com data de domingo é recusado na interface e na API.
- A validação usa a data alvo. Se hoje é domingo, sábado e todos os dias anteriores continuam registráveis.
- A mensagem curta da API é Domingo não tem aula. Escolha um dia de segunda a sábado.
- Remover registros históricos de domingo continua permitido. Confirmar na Seduc um registro histórico de domingo também continua permitido, porque é conferência e não novo registro.
- Em Saídas e Entradas, o formulário não aparece no domingo. Quando existem registros antigos, o resumo oferece Ver registros do domingo, com lista de todas as turmas, desbloqueio e remoção, sem formulário.
- A lista do dia e o resumo mostram o mesmo conjunto de turmas. Abrir um dia pelo resumo limpa o filtro de turma da aba.
- Chamadas e registros antigos de domingo continuam nos relatórios, no histórico e nas planilhas.
- A grade de aulas continua sem domingo, a grade padrão da turma vai de segunda a sábado e o calendário da justificativa antecipada continua no modo de segunda a sábado, pulando domingos em intervalos e recusando domingo isolado.
- Horários permanece no dia civil e não ganha uma regra nova além da recusa do dia 7 já existente.

## Alternativas consideradas

- Bloquear o domingo apenas na interface. Foi descartado porque chamadas diretas à API continuariam criando registros inválidos.
- Bloquear qualquer operação no domingo, inclusive remoção e conferência histórica. Foi descartado porque impede a correção de registros antigos e não melhora a consistência.
- Usar o dia corrente como critério. Foi descartado porque um domingo de plantão impediria o registro do sábado e dos dias anteriores.

## Consequências

- Saídas e Entradas deixa de aceitar novos registros no domingo, alinhada à Chamada e à Chamada Parcial.
- A limpeza de registros antigos e a conferência na Seduc continuam disponíveis.
- A documentação da API e o OpenAPI registram o 400 e o texto da mensagem.
- Os testes de contrato cobrem domingo, sábado, remoção e consulta de registros históricos.
