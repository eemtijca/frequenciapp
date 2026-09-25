# Testes

Suítes, convenções e o que cada uma protege. Os comandos completos estão no [README](../README.md) e em [tests/README.md](../tests/README.md).

## Suítes

| Suíte            | Comando             | Pré-requisitos                                           |
| ---------------- | ------------------- | -------------------------------------------------------- |
| Unidade          | `npm run test:unit` | Nenhum                                                   |
| Contratos de API | `npm run test:api`  | Aplicativo no ar, admin e conta de teste, `DATABASE_URL` |
| Ambas            | `npm test`          | Idem, na ordem                                           |

A de unidade roda em qualquer máquina sem banco. A de contratos sobe sozinha nada: aponta para o aplicativo em `APP_URL` (padrão `http://localhost:3000`), entra com a conta de teste e exercita os contratos.

## Unidade

- `tests/unit/frequencia.test.ts`: validação de dias e meses contra o calendário real, dias do mês, fuso na resolução do dia corrente, rótulo composto de turma, marca do aluno (falta prevalece, presença exige frequência, vazio sem frequência), montagem da grade por turma de origem, resumo de frequência e normalização de busca com acentos e ordinais.
- `tests/unit/usuarios.test.ts`: política de senha em todos os caminhos (curta, sem letra, sem número, longa demais, acentos aceitos), primeiro nome de saudação e rótulo de papel.
- `tests/unit/erros.test.ts`: tradução das exceções do Prisma para português com status correto (duplicidade, registro em uso, sumido, banco ocupado, serialização, validação, conexão), erro desconhecido sem vazar detalhe e classificadores de conflito.
- `tests/unit/hash.test.ts`: ida e volta do scrypt, recusa de senha errada e de hashes malformados, sais distintos por hash.
- `tests/unit/texto-editorial.test.ts`: guarda da convenção editorial. Varre código, documentação, scripts e configuração do repositório e reprova travessão (em-dash e meia-risca), reticências tipográficas, aspas curvas, setas, segunda pessoa explícita e pluralização com parênteses. Mantém o repositório coeso em estilo, de forma mecânica.

## Contratos de API

`tests/api/contratos.test.ts` cobre, contra o aplicativo no ar:

- entrada com credenciais erradas e certas, cookie HttpOnly devolvido, conta desativada recusada com 403, limite de tentativas com 429;
- corpo JSON inválido com 400 amigável e corpo acima do limite com 413;
- exigência de sessão nas consultas e bloqueio de mutação de origem externa (CSRF);
- papéis: professor barrado de criar série, listar contas e cadastrar aluno (403);
- séries: criação, duplicata sem diferenciar caixa (409), dados inválidos (400), exclusão com turmas barrada com orientação;
- turmas: criação, duplicata na série, série inexistente (404), exclusão com alunos barrada com orientação;
- professores: criação com política de senha, e-mail duplicado, atualização de nome e turmas, atribuição de turma inexistente, auto-rebaixamento e auto-desativação barrados, conta desativada não entra, exclusão com histórico barrada e sem histórico permitida;
- alunos: origem padrão na própria turma, ordem sequencial, mudança de turma preservando a origem, turma inexistente;
- frequências: criação com falta, duplicata com 409 e versão vigente, **salvamentos concorrentes em paralelo com exatamente um vencedor**, atualização com revisão vigente e recusa de obsoleta, rejeição de falta de aluno de outra turma com atomicidade conferida, professor sem atribuição barrado (403), parâmetros inválidos, consulta por dia e por mês;
- conta: troca de senha com atual errada, sucesso, senha antiga invalidada e outros aparelhos desconectados;
- trilha de auditoria confirmando os registros das ações administrativas;
- saída encerrando a sessão e verificação de saúde.

A suíte cria e limpa a própria massa (série, turmas, contas e alunos prefixados, dias de teste isolados) antes e depois, de modo que execuções repetidas não acumulam estado. Rodar com a connection string correta exportada (ver [tests/README.md](../tests/README.md)).

## Convenções

- Cada arquivo cria e limpa a própria massa; nada depende de dados reais.
- Nenhum teste depende de ordem de execução.
- Bug corrigido entra com teste que falharia antes da correção.
- Texto de interface novo precisa passar no guarda editorial.

## Cobertura

A cobertura protege o essencial do domínio (derivação de marcas e grade), a segurança de acesso (sessão, CSRF, papéis, isolamento por escopo), a integridade transacional do salvamento (duplicata, revisão, corrida concorrente) e a tradução de erros. Caminhos de apresentação são verificados por inspeção visual e navegação de ponta a ponta, registradas em [tests/README.md](../tests/README.md).
