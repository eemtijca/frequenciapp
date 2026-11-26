# ADR-085: provas específicas com frequência

## Estado

Aceita.

## Contexto

A escola leva alunos a provas externas, como o Enem e vestibulares, que não são aulas da grade nem provas bimestrais do horário. A coordenação precisava registrar quem se inscreveu, onde a prova acontece e quem compareceu, sem mexer na chamada diária. Cada prova tem nome, local e data próprios, e a equipe escolhe os alunos caso a caso. O Enem cai no domingo, e o registro costuma ser feito depois da data.

## Decisão

- Cada prova fica em `provas_especificas`, com nome de até 120 caracteres, local opcional de até 120 e data civil. A data pode ser passada ou cair no domingo.
- Os alunos inscritos ficam em `participantes_prova`, uma linha por prova e aluno. A coluna `presente` é nula quando não há registro, verdadeira para presente e falsa para ausente. Excluir a prova ou o aluno remove a inscrição.
- A administração e a coordenação usam a mesma capacidade de operação. As escritas exigem origem confiável e auditoria só com identificador e contagens.
- `PUT /api/provas/{id}/participantes` recebe a lista completa. Quem continua mantém a marca, quem sai perde a inscrição, e só entra aluno ativo e sem desistência.
- `PUT /api/provas/{id}/frequencia` grava marcas por aluno inscrito, em uma transação. Marcar de novo o mesmo valor limpa o registro na interface.
- A visão Provas fica na gaveta entre Relatórios e Alunos ou Gestão. Lista as provas com as contagens, abre o detalhe com a frequência por aluno e escolhe os alunos por turma, com busca.

## Alternativas

- Usar a Chamada Parcial: ela registra presença personalizada em dias de aula e alimenta planilhas; a prova externa é de outra natureza e não deve entrar nesses números.
- Guardar só os ausentes, como a Chamada: aqui a ausência de registro difere de presença, porque a lista é montada à mão e a frequência é lançada depois.
- Restringir à administração: a coordenação é quem acompanha os alunos nesses dias, então as duas funções operam.

## Consequências

- Duas tabelas, quatro arquivos de rota (sete operações) e uma visão a mais para manter.
- A frequência em provas não altera a Chamada, as faltas, os relatórios nem as planilhas.
- As provas específicas não entram na cópia JSON; restaurar uma cópia não as traz.
- A migração é aditiva e não reescreve dados existentes.
