# ADR-006: papéis de administrador e professor com gestão central

## Estado

Aceita.

## Contexto

O aplicativo original era pessoal: cada professor dono do próprio roster, sem noção de escola. O uso real pede que a administração configure tudo (séries, turmas, alunos e contas) e que professores apenas façam a frequência das turmas que lhes forem atribuídas, mantendo a operação simples para ambos os lados.

## Decisão

- Dois papéis na tabela de usuários: `ADMIN` (acesso root de configuração) e `PROFESSOR`.
- O administrador inicial é criado pelo comando `criar-admin` com credenciais do `.env` e, no Compose, pelo entrypoint na partida (`--somente-criar`, sem alterar conta existente); o restante nasce na área de Gestão, sem cadastro público.
- Entidades escolares normalizadas: séries, turmas, alunos com turma e turma de origem, e tabela de atribuições (professor, turma).
- Professores veem e chamam apenas as turmas atribuídas; administradores veem tudo.
- Guardas de segurança: nunca remover o último administrador ativo, nunca rebaixar nem desativar a própria conta, nunca excluir conta com frequências registradas.
- Ações administrativas registram trilha de auditoria na mesma transação.

## Consequências

- A visão de dados é reduzida por papel, o que ajuda a minimização da LGPD.
- A interface ganhou a visão Gestão (abas de Séries, Turmas, Alunos e Professores) e a vista Alunos virou consulta para professores.
- Exclusões são barradas por restrições de integridade quando deixariam órfãos, com mensagens que orientam o caminho.
- Contas desativadas perdem a sessão na requisição seguinte.
