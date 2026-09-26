# ADR-018: texto opcional na saída durante a aula

## Status

Aceita.

## Contexto

A saída antecipada usa o catálogo de justificativas para o motivo, com observação livre apenas no código Outros. Nas saídas que acontecem durante uma aula, a coordenação precisa registrar um detalhe curto que o catálogo não cobre, sem transformar o catálogo em campo opcional nem criar dois campos livres na mesma linha.

## Decisão

Manter o catálogo obrigatório em todas as saídas e acrescentar um texto livre opcional de até 100 caracteres, disponível apenas quando o momento é uma aula:

- a coluna `texto` é anulável, separada da observação de 200 caracteres;
- a API recusa texto fora de aula e observação em aula, com mensagens claras;
- no formulário, a caixa aparece com contador quando o momento é uma aula; nos intervalos e no almoço, a observação de Outros segue como antes;
- o texto aparece na lista do dia, no relatório semanal e no relatório por aluno, junto do rótulo do catálogo;
- a cópia JSON inclui o campo como opcional, compatível com cópias antigas.

## Consequências

- O motivo continua padronizado pelo catálogo, e o detalhe específico da aula fica registrado sem virar obrigação.
- A regra de qual campo vale em cada momento é validada na API e testada nos contratos.
- Relatórios e cópia de segurança passam a exibir o texto quando existir.
