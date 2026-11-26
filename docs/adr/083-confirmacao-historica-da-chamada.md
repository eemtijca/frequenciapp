# ADR-083: confirmação histórica da Chamada antes da gravação

- Status: aceita
- Data: 2026-11-25
- Atualiza a consulta e o motivo do [ADR-066](066-politica-retroativa.md). Não altera Saídas nem a política de composição histórica.

## Contexto

A equipe precisava tentar gravar uma chamada para descobrir que havia uma confirmação pendente. A indicação de salvamento vinha antes dessa decisão. O motivo obrigatório impedia confirmar quando a equipe não tinha informação adicional a registrar.

## Decisão

- A primeira chamada de uma data passada pode consultar, sem escrita ou enfileiramento, se a composição exige confirmação. A consulta é limitada à turma e ao dia e exige permissão de operação.
- O POST reavalia a composição na transação. Se ainda faltar confirmação explícita, retorna 409 sem gravar. A interface pede nova decisão se a regra mudar entre a consulta e o POST e não reenvia por conta própria.
- A primeira gravação histórica da interface envia `listaRevisada`, a lista exibida na revisão. O servidor compara os integrantes, não a ordem, com a lista efetiva da transação. Em caso de divergência, responde `LISTA_HISTORICA_ALTERADA` sem gravar; o rascunho continua disponível. Clientes legados podem omitir o campo.
- Cancelar mantém o rascunho e não inicia gravação. `motivo` é opcional com `confirmarHistorico: true`; se informado, o texto não vazio tem de 3 a 200 caracteres após a remoção de espaços das extremidades. Não se aceita o campo sem confirmação.
- A confirmação explícita é registrada na mesma transação da primeira gravação, com autor, turma, dia e a lista usada. A ausência de motivo usa uma cadeia vazia na coluna existente, sem migração nem preenchimento retroativo.

## Consequências

A revisão, a confirmação histórica e o salvamento ficam visivelmente separados. A chamada de hoje e a correção de chamada existente não ganham uma consulta prévia. A composição continua a ser decisão do servidor, e uma confirmação sem motivo continua auditável.
