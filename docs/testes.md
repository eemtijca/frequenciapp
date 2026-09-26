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

- `tests/unit/frequencia.test.ts`: validação de dias, meses e horários contra o calendário real, dia da semana ISO, aulas do dia, dias do mês e períodos (dia, semana de aula, intervalo e mês), dia seguinte e mês seguinte sem depender do fuso, hora no fuso da escola, fuso na resolução do dia corrente, rótulo composto de turma e de aula, marca do aluno (falta prevalece, presença exige frequência, falta parcial conta como falta, vazio sem frequência, FJ com o catálogo), montagem da grade por período, catálogo de justificativas e momentos de saída e normalização de busca com acentos e ordinais.
- `tests/unit/relatorios.test.ts`: marcas do dia, resumo com ausências e infrequência, distribuição por série e turma, cobertura do dia, resumo por aluno e relatório de saídas com o filtro de duas ou mais.
- `tests/unit/justificativas.test.ts`: ordenação alfabética do catálogo, rótulos e validação por catálogo informado, com o catálogo padrão como reserva.
- `tests/unit/planilha.test.ts`: dataframe da turma de origem, CSV com BOM e proteção contra fórmula, detecção de cabeçalho, coluna de aluno, colunas de dia e total, assinatura de esquema e planejamento conservador (célula vazia, fórmula, divergência, colunas e alunos novos, duplicados e idempotência).
- `tests/unit/gas.test.ts`: o `gas/Codigo.gs` rodando em `vm` com dublês do Google: token, ping, leitura com fórmula, escrita que pula ocupada e fórmula, recusa por deriva de esquema, operação destrutiva só no modo completo, cópia antes de destrutiva, marcadores de linha e coluna, criação e remoção de aba e restauração de cópia.
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
- frequências: criação com falta em todas as aulas, falta por aula específica, falta justificada com o código do catálogo, duplicata com 409 e versão vigente, **salvamentos concorrentes em paralelo com exatamente um vencedor**, atualização com revisão vigente e recusa de obsoleta, rejeição de aula de outra turma e de aula fora do dia, aluno desativado com falta registrada aceito, aluno desativado novo rejeitado, dia futuro recusado, justificativa fora do catálogo rejeitada, consulta por dia (com e sem turma), por mês e por período com filtros de turma e de autoria, período invertido rejeitado e resumo acumulado por aluno;
- saídas: registro com responsável padrão, duplicata no mesmo dia com 409, momento, justificativa e dia futuro inválidos recusados, consulta por dia e por período e remoção para correção;
- configurações e responsáveis: leitura por qualquer sessão, escrita barrada para a coordenação e permitida à administração, alternância de recursos com retorno ao padrão e listagem da equipe ativa;
- justificativas: leitura ordenada por qualquer sessão, escrita barrada para a coordenação, criação e edição pela administração, duplicata sem diferenciar caixa, dados inválidos, exclusão bloqueada quando em uso, recusa de código fora do catálogo na chamada e na saída e catálogo presente na cópia de segurança;
- cópia de segurança: exportação barrada para a coordenação, formato e versão conferidos, importação da própria cópia sem conflitos e arquivo em outro formato recusado;
- conta: troca de senha com atual errada, sucesso, senha antiga invalidada e outros dispositivos desconectados;
- trilha de auditoria confirmando os registros das ações administrativas e a ausência de nomes de alunos;
- saída encerrando a sessão e verificação de saúde (200 com o banco acessível e 503 sem ele);
- integração com Google Planilhas contra um Apps Script falso que responde 302: token e conexão, estrutura e mapa, simulação e aplicação conservadora (célula ocupada e fórmula preservadas), substituição no modo completo com cópia, remoção de linha e coluna com marcador, criação e remoção de aba, recusa por token errado, por hash divergente e por modo completo inativo.

A suíte cria e limpa a própria massa (série, turmas, aulas, alunos, contas e dias de teste isolados) antes e depois, de modo que execuções repetidas não acumulam estado. Rodar com a connection string correta exportada (ver [tests/README.md](../tests/README.md)).

## Ponta a ponta

Os specs em `tests/e2e/` rodam com Playwright headless e cobrem entrada e saída (barra lateral no desktop e menu de perfil no celular), campos de senha com exibir e ocultar, lembrar o acesso no dispositivo com sessão persistente e e-mail preenchido, banco vazio sem carregamento infinito, troca de visão pela navegação (instantânea no desktop) e por deslize com o indicador da barra inferior preso à rolagem quadro a quadro, preferência de animações por dispositivo com persistência e efeito, integração com Google Planilhas contra um Apps Script falso que responde 302 (token, conexão, estrutura, mapa, prévia na Grade e desconexão), tema de três opções, chamada diária com falta justificada, chamada por aula com saída parcial e S na grade, seletor de período próprio em popover com teclado e atalhos, abas da Gestão com toque, deslize e teclado, responsividade, login simétrico, campos do login com margem no celular, histórico, grade com divisórias, períodos e coluna acumulada, saídas antecipadas, cópia de segurança e PWA. A configuração, os projetos de navegador e o CI estão em [tests/README.md](../tests/README.md).

## Convenções

- Cada arquivo cria e limpa a própria massa; nada depende de dados reais.
- Nenhum teste depende de ordem de execução.
- Bug corrigido entra com teste que falharia antes da correção.
- Texto de interface novo precisa passar no guarda editorial.

## Cobertura

A cobertura protege o essencial do domínio (derivação de marcas e grade), a segurança de acesso (sessão, CSRF, papéis, guardas do último administrador), a integridade transacional do salvamento (duplicata, revisão, corrida concorrente, validação de aulas) e a tradução de erros. Caminhos de apresentação são verificados pela suíte de ponta a ponta, pela inspeção visual e pela navegação em larguras de celular e desktop.
