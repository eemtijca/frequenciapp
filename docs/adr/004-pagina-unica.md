# ADR-004: Página única com visões locais

## Estado

Aceita.

## Contexto

O fluxo original alterna Frequência, Histórico e Grade do mês dentro do mesmo aplicativo de página única, com estado da frequência em aberto preservado entre as trocas. A reconstrução em App Router poderia fragmentar isso em rotas de página, ao custo de recargas e de perder o estado a cada navegação.

## Decisão

- `src/app/page.tsx` como componente de servidor que resolve a sessão e pré-busca os dados do mês.
- Shell de cliente com as visões Frequência, Histórico, Grade do mês e Alunos trocadas localmente, mantendo rolagem e estado.
- Tela de entrada no mesmo endereço quando não há sessão; `router.refresh()` reexecuta a página após entrar ou sair.
- A visão Alunos foi acrescentada para o cadastro de roster, que no original era fixo em arquivo.

## Consequências

- O fluxo de uso permanece idêntico ao original: alternar entre visões não recarrega nada nem perde marcações.
- A pré-busca do servidor entrega a primeira tela pronta, sem espera por efeito cascata de requisições.
- A adição de rotas de página no futuro (por exemplo, link público de consulta) não conflita com esta decisão.
