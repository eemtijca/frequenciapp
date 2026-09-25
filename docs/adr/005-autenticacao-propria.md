# ADR-005: Autenticação própria sem cadastro público

## Estado

Aceita.

## Contexto

O aplicativo é de uso pessoal do professor. Cadastro público aberto ampliaria a superfície de abuso (contas descartáveis, spam de entrada) sem benefício para o caso real de uma ou poucas contas por implantação.

## Decisão

- A conta é criada pelo comando de operação `npm run criar-conta`, idempotente, com variáveis de ambiente.
- Entrada por e-mail e senha, com limitador de tentativas por origem e e-mail.
- Sem fluxo de recuperação por e-mail: a redefinição é operacional, pelo mesmo comando, que também atualiza a senha.
- O schema separa `usuarios` de `sessoes`, permitindo contas múltiplas com isolamento por dono quando a implantação quiser.

## Consequências

- Superfície mínima: nenhuma integração de e-mail, nenhum token de recuperação, nenhuma fila.
- O operador da implantação controla quem tem conta, alinhado ao caráter pessoal do sistema.
- Recuperação de senha depende de acesso operacional ao ambiente; documentado em [docs/operacao.md](../operacao.md).
