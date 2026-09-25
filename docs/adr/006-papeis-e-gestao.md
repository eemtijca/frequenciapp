# ADR-006: papéis de administração e coordenação

## Estado

Aceita. Substitui a versão anterior, de administrador e professor.

## Contexto

O aplicativo é usado apenas pela coordenação da escola: uma pessoa acompanha a frequência e as saídas no meio da aula, e a administração configura contas, séries, turmas, alunos e a grade de aulas. Um modelo de professor com turmas atribuídas não corresponde ao uso real e adiciona telas, tabelas e guardas que ninguém usa.

## Decisão

- Dois papéis na tabela de usuários: `ADMIN` (acesso de configuração) e `COORDENACAO` (frequência, histórico e grade).
- Toda turma e todo aluno são visíveis para as duas funções; a tabela de atribuições foi removida.
- Frequência, histórico e grade aceitam qualquer sessão ativa; cadastros e contas exigem `ADMIN`.
- Guardas: nunca remover o último administrador ativo, nunca rebaixar nem desativar a própria conta.
- Ações administrativas registram trilha de auditoria na mesma transação.

## Consequências

- A interface perde a visão de professor e as pílulas de turmas atribuídas.
- A frequência passa a ser dado da escola, com autoria anulável, e a exclusão de conta não apaga histórico.
- A tela de Gestão ganha a aba Equipe, sem atribuições.
