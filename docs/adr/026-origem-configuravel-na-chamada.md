# ADR-026: Origem configurável na Chamada

## Estado

Aceita. Complementa a exibição definida na [ADR-022](022-lista-da-chamada-e-turma-reorganizada.md).

## Contexto

A escola atual reorganizou a 3ª série. Outras escolas podem reorganizar qualquer série, várias ou nenhuma. Vincular a indicação de origem ao nome da série impediria o uso do mesmo aplicativo nesses cenários.

## Decisão

- A configuração `origemNaChamada`, desligada por padrão, controla somente a exibição da origem e do asterisco na Chamada.
- A administração seleciona séries completas e turmas avulsas. A união dessas seleções determina onde a indicação aparece; sem seleção, nenhuma turma exibe a indicação.
- As seleções ficam em relações com chaves estrangeiras e são preservadas ao desligar. A série selecionada abrange turmas criadas posteriormente. A exclusão de um cadastro retira a respectiva seleção em cascata.
- A Chamada consulta identificadores de série e turma na configuração, sem analisar o nome da série. O asterisco é visual: indica origem diferente da turma da chamada ou um marcador legado, sem alterar o nome cadastrado.
- A migração seleciona as séries de ordinal 3 já existentes para preservar o uso atual. A regra de compatibilidade existe somente nessa migração. Em uma instalação vazia, o padrão desligado continua após a criação do cadastro ou a execução do seed.
- A API valida as referências e grava a seleção com auditoria na mesma transação. Desligar não modifica alunos, histórico, origem ou sincronização com planilhas.

## Alternativas

Inferir a seleção pelo nome da série manteria uma regra específica da escola na interface. Guardar listas de identificadores em JSON dispensaria as relações, mas não garantiria referências válidas nem a limpeza das seleções após excluir uma série ou turma. As relações permitem validar essas referências no banco.

## Consequências

A escola pode alterar a exibição sem implantação de código. Selecionar uma série abrange novas turmas automaticamente; selecionar uma turma limita a indicação àquela turma. A cópia JSON exporta a chave e as seleções, mantendo a compatibilidade de leitura com cópias anteriores.
