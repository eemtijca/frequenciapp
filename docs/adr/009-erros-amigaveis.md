# ADR-009: erros de banco traduzidos para português claro

## Estado

Aceita.

## Contexto

O público do aplicativo não lê mensagens técnicas. Uma violação de índice único ou uma falha de conexão não pode chegar como `PrismaClientKnownRequestError P2002` ou stack trace: a pessoa precisa saber o que aconteceu e o que fazer, e o servidor precisa guardar o detalhe para depuração sem vazar informação sensível.

## Decisão

- Tradutor central em `src/infra/erros.ts`: códigos Prisma conhecidos viram frases curtas e acionáveis com status HTTP adequado.
- Executor comum `executarRota` envolve cada rota: exceção conhecida vira resposta amigável; desconhecida vira mensagem genérica com o detalhe apenas no log do servidor.
- Exceções de aplicação (`ErroHttp`) carregam mensagem e status decididos pela regra de negócio.
- Corpo JSON inválido e corpo acima de 200 kB têm respostas próprias (400 e 413).
- Testes unitários travam a tradução de cada código e o não-vazamento de detalhes internos.

## Consequências

- Toda a superfície de erro fala a mesma língua: "Já existe uma conta com este e-mail", "Esta frequência já foi salva. Recarregue para ver a versão mais recente", "Não foi possível falar com o banco de dados. Tente novamente em instantes".
- Mensagens orientam a ação seguinte (mover alunos, desativar em vez de excluir, aguardar e tentar de novo).
- O suporte continua com detalhe técnico no log do servidor, indexado por código de erro.
- Novos códigos Prisma relevantes entram no tradutor com teste.
