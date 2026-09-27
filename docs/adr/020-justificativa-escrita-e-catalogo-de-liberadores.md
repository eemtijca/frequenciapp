# ADR-020: justificativa escrita e catálogo de quem libera a saída

## Status

Aceita.

## Contexto

A saída antecipada exigia um código do catálogo em todo registro. O texto livre existia só como complemento da saída durante a aula, e quem liberava era uma conta da equipe. Na rotina da escola, a coordenação às vezes descreve o motivo em poucas palavras, e a lista de quem libera o estudante muda sem passar por um novo deploy. Nem toda pessoa que libera tem conta no aplicativo, então a lista fixa no código e a checagem do banco não serviam.

## Decisão

- O formulário oferece duas formas, e só uma vale por registro: escrever a justificativa em até 100 caracteres, ou escolher um tipo do catálogo como antes.
- No tipo, o texto opcional da aula e a observação de Outros fora da aula continuam como na ADR-018.
- No texto livre, o código fica nulo e o texto vale em qualquer momento, inclusive intervalo e almoço.
- Quem libera é um código do catálogo `liberadores`, gerido na Gestão como o catálogo de justificativas: código estável, rótulo e situação editáveis, exclusão barrada quando há saída usando o código. A migração semeia Diretor Adriano, Coordenadora Adriana e Coordenadora Helena.
- O registro novo exige um código do catálogo. Registros antigos continuam com `liberadoPorId` e sem código. A cópia JSON aceita os dois formatos e leva o catálogo junto.
- O nome exibido sai do rótulo atual do catálogo, e o histórico preserva o código.

## Consequências

- A coluna `justificativa` passa a aceitar nulo, com checagem de que há código ou texto.
- Deixa de existir a constraint que fixava os três códigos no banco; a validade é do catálogo, conferida na aplicação, como nas justificativas.
- A planilha recebe o motivo já resolvido (rótulo do tipo ou texto livre) e o nome de quem liberou.
- A lista de contas ativas em `GET /api/responsaveis` permanece, sem uso no formulário.
