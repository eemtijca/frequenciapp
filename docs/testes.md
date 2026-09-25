# Testes

Suítes, convenções e o que cada uma protege. Os comandos completos estão no [README](../README.md) e em [tests/README.md](../tests/README.md).

## Suítes

| Suíte            | Comando             | Pré-requisitos                                                 |
| ---------------- | ------------------- | -------------------------------------------------------------- |
| Unidade          | `npm run test:unit` | Nenhum                                                         |
| Contratos de API | `npm run test:api`  | Aplicativo no ar, admin e coordenação de teste, `DATABASE_URL` |
| Ponta a ponta    | `npm run test:e2e`  | Aplicativo no ar (ou Compose) e navegadores do Playwright      |
| PWA              | `npm run test:pwa`  | Build de produção no ar                                        |
| Ambas as de API  | `npm test`          | Idem, na ordem                                                 |

A suíte de unidade roda em qualquer máquina sem banco. A de contratos aponta para o aplicativo em `APP_URL` (padrão `http://localhost:3000`), entra com as contas de teste e exercita os contratos. A de ponta a ponta usa Playwright headless com execução serial e cobre a interface de verdade.

## Unidade

- `tests/unit/frequencia.test.ts`: validação de dias, meses e horários contra o calendário real, dia da semana ISO, aulas do dia, dias do mês, dia seguinte e mês seguinte sem depender do fuso, hora no fuso da escola, fuso na resolução do dia corrente, rótulo composto de turma e de aula, marca do aluno (falta prevalece, presença exige frequência, falta parcial conta como falta, vazio sem frequência), montagem da grade, resumo de frequência e normalização de busca com acentos e ordinais.
- `tests/unit/usuarios.test.ts`: política de senha em todos os caminhos (curta, sem letra, sem número, longa demais, acentos aceitos), primeiro nome de saudação e rótulo de papel.
- `tests/unit/erros.test.ts`: tradução das exceções do Prisma para português com status correto (duplicidade, registro em uso, sumido, banco ocupado, serialização, validação, conexão), erro desconhecido sem vazar detalhe e classificadores de conflito.
- `tests/unit/hash.test.ts`: ida e volta do scrypt, recusa de senha errada e de hashes malformados, sais distintos por hash.
- `tests/unit/decisao-admin.test.ts`: bootstrap do administrador no modo `--somente-criar`.
- `tests/unit/texto-editorial.test.ts`: guarda da convenção editorial. Varre código, documentação, scripts e configuração do repositório e reprova travessão (em-dash e meia-risca), reticências tipográficas, aspas curvas, setas, segunda pessoa explícita e pluralização com parênteses. Mantém o repositório coeso em estilo, de forma mecânica.

## Contratos de API

`tests/api/contratos.test.ts` cobre, contra o aplicativo no ar:

- entrada com credenciais erradas e certas, cookie HttpOnly devolvido, conta desativada recusada com 403, limite de tentativas com 429;
- corpo JSON inválido com 400 amigável e corpo acima do limite com 413;
- exigência de sessão nas consultas e bloqueio de mutação de origem externa (CSRF);
- papéis: coordenação barrada de criar série, listar contas, cadastrar aluno e criar aula (403);
- séries: criação, duplicata sem diferenciar caixa (409, com mensagem de série), dados inválidos (400), exclusão com turmas barrada com orientação;
- turmas: criação com aula padrão, duplicata na série, série inexistente (404), exclusão com alunos barrada com orientação;
- aulas: criação com janela e dias da semana, ordem repetida (409), horário invertido e dias vazios (400), edição, desativação, exclusão com faltas barrada e sem histórico permitida;
- equipe: criação com política de senha, e-mail duplicado, atualização de nome, auto-rebaixamento e auto-desativação barrados, conta desativada não entra, reativação, exclusão preservando o histórico com autoria anulada;
- alunos: origem padrão na própria turma, ordem sequencial, mudança de turma preservando a origem, turma inexistente;
- frequências: criação com falta em todas as aulas, falta por aula específica, duplicata com 409 e versão vigente, **salvamentos concorrentes em paralelo com exatamente um vencedor**, atualização com revisão vigente e recusa de obsoleta, rejeição de aula de outra turma e de aula fora do dia, aluno desativado com falta registrada aceito, aluno desativado novo rejeitado, dia futuro recusado, parâmetros inválidos, consulta por dia e por mês com filtros de turma e de autoria;
- conta: troca de senha com atual errada, sucesso, senha antiga invalidada e outros aparelhos desconectados;
- trilha de auditoria confirmando os registros das ações administrativas e a ausência de nomes de alunos;
- saída encerrando a sessão e verificação de saúde (200 com o banco acessível e 503 sem ele).

A suíte cria e limpa a própria massa (série, turmas, aulas, alunos, contas e dias de teste isolados) antes e depois, de modo que execuções repetidas não acumulam estado. Rodar com a connection string correta exportada (ver [tests/README.md](../tests/README.md)).

## Ponta a ponta

Os specs em `tests/e2e/` rodam com Playwright headless e cobrem entrada e saída (barra lateral no desktop e menu de perfil no celular), campos de senha com exibir e ocultar, banco vazio sem carregamento infinito, troca de visão pela navegação (instantânea no desktop) e por deslize, tema de três opções, abas da Gestão com toque, deslize e teclado, responsividade e login simétrico e, nas fases seguintes, frequência com saída por aula, painel em duas colunas no desktop, seletor de período próprio com teclado e atalhos, histórico, grade com divisórias e PWA. A configuração, os projetos de navegador e o CI estão em [tests/README.md](../tests/README.md).

## Convenções

- Cada arquivo cria e limpa a própria massa; nada depende de dados reais.
- Nenhum teste depende de ordem de execução.
- Bug corrigido entra com teste que falharia antes da correção.
- Texto de interface novo precisa passar no guarda editorial.

## Cobertura

A cobertura protege o essencial do domínio (derivação de marcas e grade), a segurança de acesso (sessão, CSRF, papéis, guardas do último administrador), a integridade transacional do salvamento (duplicata, revisão, corrida concorrente, validação de aulas) e a tradução de erros. Caminhos de apresentação são verificados pela suíte de ponta a ponta, pela inspeção visual e pela navegação em larguras de celular e desktop.
