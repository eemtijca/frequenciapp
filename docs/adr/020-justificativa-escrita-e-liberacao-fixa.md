# ADR-020: justificativa escrita e liberação fixa na saída

## Estado

Aceita.

## Contexto

A saída antecipada exigia um código do catálogo em todo registro. O texto livre existia só como complemento da saída durante a aula, e quem liberava era uma conta da equipe. Na rotina da escola, a coordenação às vezes descreve o motivo em poucas palavras, e quem libera o estudante é sempre uma destas pessoas: Diretor Adriano, Coordenadora Adriana ou Coordenadora Helena.

## Decisão

- O formulário oferece duas formas, e só uma vale por registro: escrever a justificativa em até 100 caracteres, ou escolher um tipo do catálogo como antes.
- No tipo, o texto opcional da aula e a observação de Outros fora da aula continuam como na ADR-018.
- No texto livre, o código fica nulo e o texto vale em qualquer momento, inclusive intervalo e almoço.
- Quem libera é um código fixo (`adriano`, `adriana`, `helena`), obrigatório nos registros novos. O rótulo exibido sai dessa lista.
- Registros antigos continuam com `liberadoPorId` e sem código. A cópia JSON aceita os dois formatos.
- A planilha recebe o motivo já resolvido (rótulo do tipo ou texto livre) e o nome de quem liberou.

## Consequências

- A coluna `justificativa` passa a aceitar nulo, com checagem de que há código ou texto.
- O código de liberação, quando preenchido, só aceita os três valores.
- A lista de contas ativas em `GET /api/responsaveis` permanece, mas o formulário não a usa mais.
