# ADR-017: modo completo com destrave, prazo e cópias automáticas

## Status

Aceita.

## Contexto

Usar uma planilha existente exige, às vezes, atualizar divergências e remover o que a integração criou. A operação é destrutiva por natureza e precisa de uma trava proporcional ao risco, sem transformar o modo conservador em burocracia.

## Decisão

Um modo completo, desligado por padrão, destravado apenas por administrador com a frase `EDITAR PLANILHA`, a senha conferida no servidor e duração pré-definida de 5, 15, 30 ou 60 minutos, padrão 15:

- admin e coordenação aplicam enquanto a janela estiver ativa; a expiração é conferida no servidor em cada requisição;
- prorrogar exige senha de novo; voltar ao conservador é livre para qualquer sessão;
- a remoção só alcança linha, coluna e aba com marcador de Developer Metadata da integração;
- fórmulas nunca são sobrescritas, nem no modo completo;
- antes de cada operação destrutiva o script duplica a aba em cópia oculta, mantendo as três mais recentes;
- a restauração é feita pela interface, só por administrador, com senha e frase, guardando a versão atual como nova cópia;
- operações destrutivas não têm retentativa automática e são identificadas por conteúdo, nunca por índice.

## Consequências

- O risco de perda cai para o intervalo da janela e para o que a própria integração criou.
- A cópia automática permite desfazer um engano em segundos.
- A interface precisa deixar claro quando o modo está ativo e quais categorias destrutivas estão marcadas.
