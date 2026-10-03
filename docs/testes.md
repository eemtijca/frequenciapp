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

- `tests/unit/frequencia.test.ts`: validação de dias, meses e horários contra o calendário real, dia da semana ISO, aulas do dia, dias do mês e períodos (dia, semana de aula, intervalo e mês), dia seguinte e mês seguinte sem depender do fuso, hora no fuso da escola, fuso na resolução do dia corrente, rótulo composto de turma e de aula, marca do aluno (falta prevalece, presença exige frequência, falta parcial conta como falta, vazio sem frequência, FJ com o catálogo), montagem da grade por período, catálogo de justificativas, momentos de saída, texto livre da saída, validação do catálogo de quem libera e normalização de busca com acentos e ordinais.
- `tests/unit/relatorios.test.ts`: marcas do dia, resumo com ausências e infrequência, distribuição por série e turma, cobertura do dia, resumo por aluno e relatório de saídas com o filtro de duas ou mais.
- `tests/unit/justificativas.test.ts`: ordenação alfabética do catálogo, rótulos e validação por catálogo informado, com o catálogo padrão como reserva.
- `tests/unit/planilha.test.ts`: dataframe da turma de origem, CSV com BOM e proteção contra fórmula, detecção de cabeçalho, coluna de aluno, colunas de dia e total, assinatura de esquema e planejamento conservador (célula vazia, fórmula, divergência, colunas e alunos novos, duplicados e idempotência); casamento pelo código do aluno na linha, vínculo pelo nome só quando único na turma e na aba, homônimos pulados com aviso, linha nova depois da última linha lida e candidata a remoção pelo código.
- `tests/unit/planilha-saidas.test.ts`: cabeçalho da aba única de saídas, colunas por rótulo, bloqueio por falta de Aluno ou Data e por mesclagem, planejamento conservador e completo (linha nova, célula vazia, correção só em linha criada pela integração, ambiguidade, remoção no período) e limites atualizados após um envio.
- `tests/unit/planilha-envios.test.ts`: erro vigente dos cards (por turma de origem na frequência, histórico único nas saídas), data do último envio pelo instante do envio no fuso da escola e datas sem horário que não mudam de dia com o fuso do processo.
- `tests/unit/estatisticas-diretor.test.ts`: agregação da visão do diretor sobre a grade, com denominador nos dias com chamada da turma atual, aluno sem chamada fora do risco, semana com feriado sem chamada, limite de risco inclusivo, ordenação pela taxa e categorias que escondem F, FJ e saídas.
- `tests/unit/importacao-alunos.test.ts`: leitura da relação em CSV (BOM, CRLF, aspas, vírgula aceita, agrupamento por turma pela ordem), recusa de arquivo vazio, sem alunos ou com cabeçalho fora do padrão, erro por linha com número e problema, exportação com proteção contra fórmula que volta idêntica na leitura, casamento sem acento que mantém o id, mudanças de turma, origem, ordem e reativação, aluno novo, desativados e bloqueios.
- `tests/unit/frequencia.test.ts` também cobre a marca pela lista da chamada: aluno movido mantém a presença e a falta parcial da turma anterior, e a chamada da turma nova antes da mudança não vira presença.
- `tests/unit/diretores.test.ts`: validação do identificador, formato e aleatoriedade da palavra-chave, ciclo de vida da credencial (sem palavra, emitida, em uso, expirada e revogada, com a revogação vencendo a validade), vínculos vigentes e recorte do período, categorias visíveis.
- `tests/unit/guardas-rotas.test.ts`: varre `src/app/api/**/route.ts` e exige guarda de capacidade em cada manipulador exportado, com as rotas públicas listadas e justificadas no próprio teste; também recusa comparação direta de papel dentro das rotas.
- `tests/unit/paleta.test.ts`: os tokens de falta e falta justificada do `globals.css`, nos dois temas, com separação mínima sob protanopia, deuteranopia e tritanopia simuladas (Machado, 2009) e contraste WCAG; o auxiliar de cor fica em `tests/helpers/cor.ts`.
- `tests/unit/planilha-erros.test.ts`: diagnóstico técnico limitado, separado da mensagem exibida. `google-planilhas-api.test.ts` cobre os marcadores nativos de linha e coluna, inclusive índice inicial omitido.
- `tests/unit/usuarios.test.ts`: política de senha em todos os caminhos (curta, sem letra, sem número, longa demais, acentos aceitos), primeiro nome de saudação, rótulo de papel e a matriz de capacidades de cada papel, com recusa para papel desconhecido.
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
- saídas: registro com um código do catálogo de quem libera, justificativa escrita, duplicata no mesmo dia com 409, momento, justificativa e dia futuro inválidos recusados, consulta por dia e por período e remoção para correção;
- configurações e responsáveis: leitura por qualquer sessão, escrita barrada para a coordenação e permitida à administração, alternância de recursos com retorno ao padrão e listagem da equipe ativa;
- justificativas: leitura ordenada por qualquer sessão, escrita barrada para a coordenação, criação e edição pela administração, duplicata sem diferenciar caixa, dados inválidos, exclusão bloqueada quando em uso, recusa de código fora do catálogo na chamada e na saída e catálogo presente na cópia de segurança;
- quem libera: leitura ordenada por qualquer sessão, escrita barrada para a coordenação, criação, edição de rótulo e situação pela administração, duplicata sem diferenciar caixa, dados inválidos, exclusão bloqueada quando há saída usando o código e catálogo presente na cópia de segurança, com os liberadores criados pela própria suíte;
- cópia de segurança: exportação barrada para a coordenação, formato e versão conferidos, importação da própria cópia sem conflitos e arquivo em outro formato recusado;
- conta: troca de senha com atual errada, sucesso, senha antiga invalidada e outros dispositivos desconectados;
- trilha de auditoria confirmando os registros das ações administrativas e a ausência de nomes de alunos;
- saída encerrando a sessão e verificação de saúde (200 com o banco acessível e 503 sem ele);
- envio incremental (`tests/api/planilha-incremental.test.ts`, massa com prefixo QN): sem envio anterior cobre os dias com chamada do período; sem alteração não há envio; o dia seguinte vai sozinho e cria sua coluna sem Revisar estrutura; queda da conexão depois de gravar vira `PARCIAL` com a mensagem de conferência, e o reenvio não duplica a coluna; o envio vai uma turma por requisição e a falha de uma não impede a outra.
- importação da relação em CSV (`tests/api/importacao-alunos.test.ts`, massa com prefixo QI): recusa para a coordenação, prévia sem gravar, aplicação que move, reordena, cria e desativa mantendo a falta registrada antes, repetição sem mudança, bloqueio que impede aplicar e cabeçalho fora do padrão apontado na prévia.
- turma reorganizada (`tests/api/turma-reorganizada.test.ts`, massa com prefixo QR): a chamada nova grava a relação atual, o aluno movido mantém a origem, continua na chamada antiga da turma anterior mesmo ao salvar de novo, não entra na chamada nova da turma que deixou, e a grade pela turma original consolida os dias das duas turmas na linha dele.
- diretores de turma (`tests/api/diretores.test.ts`, massa com prefixo QD): cadastro barrado para a coordenação, criação com turma, identificador repetido ou com arroba recusado, conta fora da Equipe, entrada recusada antes da emissão, palavra-chave em blocos, entrada pelo identificador com primeiro uso e cookie de sessão, **todas as rotas da equipe com 403 para o diretor** (lidas dos arquivos de rota), troca obrigatória com palavra diferente e validade renovada, retirada de turma na hora (vínculo do dia apagado, vínculo antigo encerrado ontem), estatísticas barradas antes da troca da palavra, para a coordenação e para turma fora do vínculo, período recortado ao início do vínculo e categorias liberadas só pelos parâmetros, palavra vencida e revogada recusadas com a sessão derrubada, parâmetros com faixas e faltas obrigatórias e limite de tentativas pelo parâmetro, contado no banco.

A suíte cria e limpa a própria massa (série, turmas, aulas, alunos, contas e dias de teste isolados) antes e depois, de modo que execuções repetidas não acumulam estado. Rodar com a connection string correta exportada (ver [tests/README.md](../tests/README.md)). No CI, o serviço `app` usa a rede do host e carrega `tests/helpers/redirecionar-google.mjs` por `NODE_OPTIONS` (ver `compose.ci.yml`). Somente tokens sintéticos encaminham requisições OAuth e Sheets API ao Google falso no loopback; os endereços de produção permanecem fixos.

- Integração com Google Planilhas contra OAuth e Sheets API simulados: conexão, estrutura, mapa, células ocupadas e fórmulas preservadas, marcadores, identificação por código após renomeação, saídas, entradas, envio automático, autorização revogada e resposta perdida sem repetição. Rotas antigas respondem 404 e configuração com endpoint é recusada.

## Chamada Parcial

A cobertura da Chamada Parcial protege o registro independente por turno ou aulas, validação de datas e limites, confirmação manual e revisão concorrente. Correções efetivas reabrem a pendência da Seduc; nenhuma operação cria frequência regular ou altera indicadores da chamada normal.

`tests/unit/backup-parcial.test.ts` verifica a igualdade por dia civil na restauração: o retorno `date` do PostgreSQL à meia-noite UTC deve corresponder ao dia preparado ao meio-dia UTC, e um dia diferente continua sendo conflito.

`tests/api/backup-parcial.test.ts` usa série, turma e aluno sintéticos próprios. Confere exportação e restauração de identidade, nomes históricos, revisão, datas e confirmação; conflitos por identificador ou aluno e dia sem sobrescrita; cópias antigas sem o campo; referência ausente; conta histórica removida e recusa de tipo, aulas, turno ou confirmação incoerentes.

A integração do terceiro arquivo é testada contra OAuth e Sheets API simulados, incluindo prévia, idempotência por UUID, preservação de dados manuais e fórmulas e atualização explícita de linhas marcadas. A navegação verifica Gestão no cabeçalho móvel e Chamada Parcial ao lado de Chamada; testes de interface acompanham a lista completa antes de salvar, ordem por número, registro pela linha, busca, filtros, bloqueio de desistentes, preservação de nomes históricos, remoção sem ocultar alunos e confirmação manual, incluindo tela de 360 pixels.

## Ponta a ponta

A execução usa a imagem oficial da Microsoft, sem instalar navegadores no host: rode `npm run test:e2e:docker` com o aplicativo no ar. O script e a alternativa no host estão em [tests/README.md](../tests/README.md).

Os specs em `tests/e2e/` rodam com Playwright headless e cobrem entrada e saída (barra lateral no desktop e menu de perfil no celular), campos de senha com exibir e ocultar, lembrar o acesso no dispositivo com sessão persistente e e-mail preenchido, banco vazio sem carregamento infinito, troca de visão pelos botões com o indicador da barra inferior na visão ativa, integração com Google Planilhas contra respostas HTTP simuladas do Google (conexão Google, estrutura, mapa, prévia na Grade, exportação CSV e desconexão), planilha de saídas (configuração na Gestão, envio pela vista Saídas e reenvio sem duplicar), diretores de turma na Gestão (identificador inválido sinalizado, cadastro com turma, palavra-chave exibida uma vez, revogação só com motivo e parâmetros de acesso; o diretor entra pelo identificador, troca a palavra no diálogo obrigatório e vê só a própria turma, com gráficos, tabela e nenhuma navegação da equipe), relação de alunos em CSV (botões inteiros no celular, arquivo fora do padrão sinalizado antes de conferir, importação com prévia e exportação no mesmo schema), extras do 3º ano (Alunos por origem, busca por origem na Chamada, turma original em círculo na turma reorganizada e origem em massa), saída durante a aula com texto opcional, justificativa escrita e responsável do catálogo de quem libera, tema de três opções, chamada diária com falta justificada, chamada por aula com saída parcial e S na grade, seletor de período próprio em popover com teclado e atalhos, abas da Gestão com toque e teclado, responsividade, login simétrico, campos do login com margem no celular, histórico, grade com divisórias, períodos e coluna acumulada, saídas antecipadas, cópia de segurança e PWA, além de toasts em todas as ações, trava de toque duplo nas ações de rede, tipografia Plus Jakarta Sans com JetBrains Mono nos números e telas de estado (404, sessão expirada e avisos internos). A configuração, os projetos de navegador e o CI estão em [tests/README.md](../tests/README.md).

## Capturas do README

As imagens do README são geradas por `tests/e2e/imagens.spec.ts` e gravadas em `docs/imagens/`, com o aplicativo no ar e a semente de desenvolvimento aplicada. O spec usa o estado de sessão criado pelo setup global, captura o Painel em 1440x900 no Chromium e a Chamada em 390x844 no mobile-chrome, nos temas claro e escuro, sem dados reais. Para regenerar:

```bash
npm run capturas:readme         # Playwright local, com o aplicativo no ar
npm run capturas:readme:docker  # imagem oficial da Microsoft, com o aplicativo no ar
```

Os PNGs versionados em `docs/imagens/` não são editados à mão. Quando a interface mudar, regenere as capturas e confira o diff das imagens no pull request.

## Convenções

- Cada arquivo cria e limpa a própria massa; nada depende de dados reais.
- Nenhum teste depende de ordem de execução.
- Bug corrigido entra com teste que falharia antes da correção.
- Texto de interface novo precisa passar no guarda editorial.

## Cobertura

A cobertura protege o essencial do domínio (derivação de marcas e grade), a segurança de acesso (sessão, CSRF, papéis, guardas do último administrador), a integridade transacional do salvamento (duplicata, revisão, corrida concorrente, validação de aulas) e a tradução de erros. Caminhos de apresentação são verificados pela suíte de ponta a ponta, pela inspeção visual e pela navegação em larguras de celular e desktop.
