# API

Rotas HTTP do aplicativo. Todas respondem JSON com `Cache-Control: no-store`. Mutações exigem sessão e origem confiável; consultas exigem sessão. Erros seguem o formato `{"error": "mensagem", "codigo"?: "CODIGO"}` com o código HTTP adequado, em português claro e sem detalhes internos (ADR-009). O campo `codigo` é estável e ajuda a interface a escolher o título e a ação, sem depender do texto da mensagem.

Autenticação por cookie `frequenciapp_sessao` (HttpOnly, SameSite=Lax, Secure em produção, salvo com `PERMITIR_HTTP=true`). Guardas por capacidade ([ADR-021](adr/021-acesso-de-leitura-dos-diretores-de-turma.md)): rotas de cadastro, de contas, de configurações de recursos, dos catálogos, das integrações e de cópia de segurança exigem `administrar` (papel `ADMIN`); chamada, relatórios, saídas e consultas exigem `operar` (`ADMIN` e `COORDENACAO`); a troca da própria senha exige `alterarPropriaSenha`; as estatísticas do diretor de turma exigem `verEstatisticasDasTurmas` (papel `DIRETOR_TURMA`). Sem sessão, 401; com sessão sem a capacidade, 403.

Corpos malformados respondem 400 com leitura amigável; corpos acima de 200 kB respondem 413.

## Documentação interativa

A especificação OpenAPI 3.1 é mantida em `docs/openapi.json` e servida em `GET /api/docs/openapi.json`; a interface Swagger UI fica em `GET /api/docs` e a referência em Markdown em `GET /api/docs/api.md`. Cada operação traz `operationId` estável, resumo, descrição, exemplos e as respostas de erro. O "Try it out" reaproveita a sessão do navegador: entre no aplicativo antes de testar.

O JavaScript e o CSS do Swagger UI são servidos localmente em `/vendor/swagger-ui`. A instalação, o início de desenvolvimento e o build copiam os dois arquivos de `swagger-ui-dist`; o build da Vercel também passa por essa preparação, mesmo com dependências em cache. A falta de um arquivo interrompe o comando antes da compilação. `vercel.json` usa `NODE_ENV=development` somente no comando de instalação para incluir as dependências de desenvolvimento, com a sintaxe aceita pelo pnpm 12. O build e a execução continuam em produção. Em caso de 404 nesses caminhos, refaça o deploy com `pnpm run vercel-build`.

O workflow de build executa o comando de instalação de `vercel.json` com um ambiente inicial de produção. Essa conferência usa a versão do pnpm fixada em `package.json` e detecta opções incompatíveis antes de compilar.

- Em desenvolvimento: `http://localhost:3000/api/docs`.
- Lint da especificação: `pnpm run lint:api`, com o ruleset em `redocly.yaml`.
- Guarda de cobertura: `tests/unidade/interface/openapi.test.ts` confere a especificação contra as rotas. A decisão está no [ADR-043](adr/043-documentacao-interativa-e-csp.md).

## Consumo por agentes de IA

- A especificação em `/api/docs/openapi.json` é a fonte da verdade para modelos e agentes: operações, schemas, exemplos e erros.
- O índice [../public/llms.txt](../public/llms.txt) é servido em `/llms.txt` e aponta o contrato, a referência e a orientação de uso seguro.
- A raiz anônima publica o link oculto para `/llms.txt`, o `rel=alternate` no HTML e o cabeçalho `Link` da resposta, para o agente achar o índice antes de qualquer sessão.
- Os `operationId` em português são estáveis e viram nome de ferramenta em geradores de SDK e de servidores MCP. A versão em Markdown da referência fica em `/api/docs/api.md`.

## Autenticação

### POST /api/auth/entrar

Corpo: `{ "login": string, "senha": string, "lembrar"?: boolean }`. O `login` é o e-mail da equipe ou o identificador do diretor de turma; o campo antigo `email` continua aceito no lugar de `login`.

Respostas:

- 200 `{"usuario": {"id", "nome", "email", "papel", "ativo"}}` e cookie de sessão. No diretor, `email` traz o identificador, o cookie é de sessão e a validade no servidor é a menor entre a sessão do diretor e a validade da palavra-chave.
- 400 quando o corpo é inválido.
- 401 com mensagem genérica ("E-mail, identificador ou senha incorretos.") quando credenciais não conferem.
- 403 quando a conta está desativada, quando a palavra-chave do diretor venceu ou foi revogada (só depois de a palavra conferir) ou quando a origem não é confiável.
- 429 após excesso de tentativas por dispositivo e login ou por login, com limites e janela dos parâmetros de acesso.

### POST /api/auth/sair

Encerra a sessão corrente e limpa o cookie.

- 200 `{"ok": true}`.

### GET /api/auth/sessao

- 200 `{"usuario": {...}}` ou `{"usuario": null}`.

## Notificações

Assinaturas e preferências exigem `receberNotificacoes` e operam somente sobre a conta corrente. Diretores também precisam concluir a troca inicial da palavra-chave. A configuração da escola exige administração e registra auditoria. A agenda usa segredo independente, sem autenticação por cookie. Detalhes em [notificacoes.md](notificacoes.md).

| Método e rota                                   | Corpo e resposta                                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notificacoes/assinatura?endpoint=...` | Endpoint opcional. Responde `{ configurada, chavePublica, ativa, preferencias, tipos, horarioResumo, horarioPendencias, fuso }`. Os tipos incluem disponibilidade da escola, sem chaves privadas ou outras assinaturas. |
| `POST /api/notificacoes/assinatura`             | `{ endpoint, keys: { p256dh, auth } }`. Associa o dispositivo à conta e à sessão; responde `{ ok: true }`. Máximo de cinco dispositivos, 409 ao exceder.                                                                |
| `DELETE /api/notificacoes/assinatura`           | `{ endpoint }`. Remove somente a assinatura da conta; idempotente, responde `{ ok: true }`.                                                                                                                             |
| `POST /api/notificacoes/teste`                  | `{ endpoint }`. Testa a assinatura própria, com limite de um minuto (429). Sem assinatura, 404; expirada, 410; falha temporária, 503.                                                                                   |
| `GET /api/notificacoes/resumo`                  | Exige `Authorization: Bearer CRON_SECRET`, sem parâmetros de escopo. Retorna `{ configurada, enviadas, expiradas, falhas, ignoradas }`. Segredo ausente ou incorreto: 403; falha temporária: 503.                       |
| `PATCH /api/notificacoes/preferencias`          | Campos booleanos parciais `resumoDiario`, `novasChamadas` e `chamadasPendentes`. Retorna `{ preferencias }` da conta. Tipo incompatível com o papel: 400.                                                               |
| `GET /api/notificacoes/configuracao`            | Restrito à administração. Retorna `{ configuracao, fuso }`, com tipos disponíveis e horários.                                                                                                                           |
| `PATCH /api/notificacoes/configuracao`          | Administração. Campos booleanos de disponibilidade e `horarioResumo`, `horarioPendencias` em `HH:MM`. Retorna `{ configuracao, fuso }`, com auditoria. Dados inválidos: 400.                                            |
| `GET /api/notificacoes/agenda`                  | Mesma autenticação e contagens da rota de resumo. Verifica todos os tipos, respeitando horários, preferências e elegibilidade atual. Não aceita escopo escolhido pelo chamador.                                         |

## Conta

### POST /api/conta/senha

Troca a própria senha. Corpo: `{ "senhaAtual": string, "senhaNova": string }`. As outras sessões abertas deste usuário são encerradas.

- 200 `{"ok": true}`.
- 400 quando a senha atual não confere, a nova está fora da política (mínimo 8 caracteres, uma letra e um número) ou o corpo é inválido.
- 429 depois de cinco tentativas em 15 minutos para a mesma conta; o contador é limpo quando a senha atual confere.

### POST /api/conta/confirmar-senha

Confere a senha da própria conta sem alterar a sessão nem gravar dados. Exige a capacidade `operar`. Corpo: `{ "senha": string }`.

- 200 `{"ok": true}`.
- 400 quando a senha não confere ou o corpo é inválido.
- 401 sem sessão; 403 com sessão sem a capacidade `operar` ou origem não confiável.
- 429 depois de cinco tentativas em 15 minutos para a mesma conta; o contador é limpo quando a senha confere.

## Diretores de turma (administração)

Contas só de leitura das estatísticas das turmas de origem do vínculo ([ADR-021](adr/021-acesso-de-leitura-dos-diretores-de-turma.md)). Todas exigem `administrar`.

Diretor: `{ id, nome, identificador, ativo, estado, emitidaEm, expiraEm, primeiroUsoEm, revogadaEm, motivoRevogacao, turmas }`, com `estado` entre `sem_palavra`, `emitida`, `em_uso`, `expirada` e `revogada`, e `turmas` com os vínculos vigentes hoje (`{ id, turmaId, turma, inicio, fim }`).

### GET /api/diretores

- 200 `{"diretores": Diretor[]}`, ativos primeiro.

### POST /api/diretores

Corpo: `{ "nome": string, "identificador": string, "turmaIds"?: uuid[], "inicioVinculo"?: "YYYY-MM-DD" }`. O identificador usa minúsculas, números, ponto e hífen, de 3 a 40 caracteres, sem arroba. A conta nasce sem palavra-chave e não entra até a emissão; os vínculos começam em `inicioVinculo` (padrão: hoje), que pode ser retroativo, a partir de 2000-01-01, e nunca futuro.

- 201 `{"diretor": Diretor}`; 400 validação; 404 turma inexistente; 409 identificador em uso.

### PATCH /api/diretores/{id}

Corpo parcial: `{ nome?, ativo?, turmaIds?, inicioVinculo? }`. `inicioVinculo` antecipa o início das turmas já acompanhadas (nunca o adia) e vale como início das turmas novas; data futura é recusada. Turma retirada deixa de valer na hora: o vínculo termina ontem ou, se começou hoje, sai inteiro. Desativar encerra as sessões.

- 200 `{"diretor": Diretor}`; 404 diretor ou turma inexistente.

### POST /api/diretores/{id}/palavra-chave

Emite uma palavra-chave nova, em blocos de quatro, válida pelos dias dos parâmetros e com troca obrigatória no primeiro acesso. A anterior deixa de valer e as sessões abertas caem. A palavra só aparece nesta resposta.

- 200 `{"palavraChave": string, "diretor": Diretor}`; 404 diretor inexistente; 409 diretor desativado.

### POST /api/diretores/{id}/revogar

Corpo: `{ "motivo": string }`, de 3 a 200 caracteres. A senha vira inutilizável e todas as sessões do diretor caem.

- 200 `{"diretor": Diretor}`; 400 sem motivo; 404 diretor inexistente; 409 sem palavra-chave ativa.

## Parâmetros de acesso (administração)

### GET /api/parametros-acesso

- 200 `{"parametros": { validadePalavraDias, sessaoDiretorHoras, tentativasPorOrigem, tentativasPorLogin, janelaMinutos, categoriasDiretor, limiteRiscoPercentual }}`.

### PATCH /api/parametros-acesso

Corpo parcial com os mesmos campos. Faixas: validade de 1 a 365 dias, sessão de 1 a 72 horas, tentativas por dispositivo de 1 a 100, por login de 1 a 500, janela de 1 a 1440 minutos e limite de risco de 1% a 100%. `categoriasDiretor` é subconjunto de `faltas`, `justificativas` e `saidas`, sempre com `faltas`.

- 200 `{"parametros": ...}`; 400 fora da faixa.

## Visão do diretor de turma

### GET /api/diretor/estatisticas?turmaId=&de=&ate=

Exige `verEstatisticasDasTurmas`. Estatísticas agregadas dos alunos ativos cuja turma de origem é `turmaId`, com a marca tirada da chamada da turma atual de cada um (o mesmo recorte da Grade). `de` e `ate` são datas `AAAA-MM-DD`, no máximo um ano.

- O escopo sai do banco: a turma precisa ter vínculo vigente hoje com o diretor da sessão. O período é recortado ao vínculo e ao dia corrente; sem interseção, `periodo` e `estatisticas` voltam nulos.
- Denominador: os dias com chamada registrada na turma atual do aluno. Ausência soma faltas e faltas justificadas; em risco é quem alcança o `limiteRiscoPercentual` dos parâmetros.
- `faltas` e `justificadas` só vêm preenchidos com a categoria `justificativas` liberada, e `saidas` com a categoria `saidas`; fora delas, `null`.
- Cada consulta fica na auditoria como `diretor.consultar`.

Respostas:

- 200 `{"turmaId", "turma", "periodo": {de, ate} | null, "vinculo": {inicio, fim}, "estatisticas": { alunos[], semanas[], resumo, limiteRisco, categorias } | null}`. Aluno: `{ alunoId, nome, ausencias, faltas, justificadas, saidas, diasComChamada, taxa, emRisco }`, ordenados pela taxa. Semana: `{ inicio (segunda-feira), ausencias, faltas, justificadas, alunoDias, taxa }`.
- 400 consulta malformada ou período invertido.
- 403 sem a capacidade, com a palavra-chave ainda por trocar ("Troque a palavra-chave para ver as estatísticas.") ou com turma fora do vínculo ("Esta turma não está entre as suas.").

## Séries

### GET /api/series

- 200 `{"series": Serie[]}` na ordem de exibição. Qualquer sessão.

### POST /api/series

Corpo: `{ "nome": string, "ordem": number }`. Apenas administração.

- 201 `{"serie": Serie}`.
- 400 validação; 403 sem papel de administração; 409 nome repetido sem diferenciar caixa.

### PATCH /api/series/{id}

Corpo parcial: `{ nome?, ordem? }`.

- 200 `{"serie": Serie}`; 404 inexistente; 409 nome repetido.

### DELETE /api/series/{id}

- 200 `{"ok": true}`; 409 quando a série ainda tem turmas; 404 inexistente.

## Turmas

### GET /api/turmas

- 200 `{"turmas": Turma[]}` com as aulas de cada turma. Qualquer sessão.

Turma: `{ id, nome, serieId, serieNome, rotulo, horarios }`, com rótulo composto, por exemplo "1º ano A".

### POST /api/turmas

Corpo: `{ "serieId": string, "nome": string }`. Apenas administração. A turma nasce com a aula padrão (00:00 às 23:59, de segunda a sábado).

- 201 `{"turma": Turma}`; 404 série inexistente; 409 turma repetida na série.

### POST /api/turmas/ordenar

Corpo: `{ "confirmar": true }`. Apenas administração, com origem confiável. Reorganiza os alunos de todas as turmas atuais em uma única transação, ordenando os ativos por nome em português e renumerando de 1 em diante. Os inativos ficam após os ativos, também pelo nome. Homônimos mantêm a posição relativa; números iguais têm desempate pelo código do aluno.

- 200 `{ "turmas", "alunos", "atualizados" }`, contando turmas com alunos, alunos incluídos e números alterados. A repetição sem mudanças retorna `atualizados: 0`.
- 400 confirmação ausente ou inválida; 401 sem sessão; 403 sem autorização ou com origem inválida.
- Altera somente a numeração, preservando códigos, nomes, turmas atual e original, situação e histórico. Não modifica as linhas das planilhas Google existentes. Novos cadastros continuam entrando no final da turma até outra reorganização.

### PATCH /api/turmas/{id}

Corpo parcial: `{ nome?, serieId? }`.

- 200 `{"turma": Turma}`; 404 turma ou série inexistente; 409 rótulo repetido.

### DELETE /api/turmas/{id}

- 200 `{"ok": true}`; 409 quando ainda existem alunos ou frequências.

## Aulas

Todas as rotas de aulas exigem papel de administração.

### GET /api/horarios?turmaId=uuid

- 200 `{"horarios": Horario[]}` na ordem das aulas.
- 400 quando a turma não é informada ou é inválida.

Horario: `{ id, turmaId, ordem, inicio, fim, diasSemana, disciplinas, ativo }`, com `inicio` e `fim` em `HH:MM` e `diasSemana` em ISO de 1 (segunda) a 6 (sábado). Domingo não tem aula: `7` é recusado com 400 ("Domingo não tem aula.") ao criar e ao editar, e grades antigas que ainda o guardam são ignoradas na Chamada. `disciplinas` é um mapa de nomes por dia, por exemplo `{ "1": "Matemática", "2": "Português" }`; aulas sem nomes retornam `{}`. Cada chave deve corresponder a um dia selecionado e cada nome tem até 80 caracteres após retirar espaços das extremidades.

### POST /api/horarios

Corpo: `{ "turmaId": string, "ordem": number, "inicio": "HH:MM", "fim": "HH:MM", "diasSemana": number[], "disciplinas"?: Record<string, string>, "ativo"?: boolean }`.

- 201 `{"horario": Horario}`.
- 400 horário inválido, fim não posterior ao início, dias vazios ou repetidos, chave de disciplina fora dos dias selecionados, nome não textual ou acima do limite.
- 404 turma inexistente; 409 ordem repetida na turma.

### PATCH /api/horarios/{id}

Corpo parcial: `{ ordem?, inicio?, fim?, diasSemana?, disciplinas?, ativo? }`. Omitir `disciplinas` preserva os nomes; informar apenas alguns dias mescla os nomes sem substituir os outros. Texto vazio limpa o nome daquele dia. Retirar um dia de `diasSemana` também retira sua disciplina.

- 200 `{"horario": Horario}`; 404 inexistente; 409 ordem repetida.

### POST /api/horarios/copiar

Corpo: `{ "turmaOrigemId": uuid, "turmaDestinoId": uuid }`. Apenas administração, com origem permitida.

- 201 `{"horarios": Horario[]}` com as aulas copiadas, ordenadas por ordem, com novos identificadores e a turma de destino.
- 400 identificador inválido, origem igual ao destino ou origem sem aulas; 404 turma inexistente.
- 409 se alguma ordem da origem já existe no destino, inclusive em aula desativada. Nenhuma aula é copiada nesse caso.

A cópia inclui todas as aulas da origem, preservando ordem, início, fim, dias, disciplinas e estado ativo. Aulas de outras ordens no destino permanecem intactas. Leitura, conferência, inserção em lote e auditoria ocorrem na mesma transação serializável. A operação não altera faltas, frequências nem cópias JSON existentes. Sem sessão responde 401; coordenação e origem não permitida recebem 403.

### DELETE /api/horarios/{id}

- 200 `{"ok": true}`; 409 quando a aula já tem faltas registradas (o caminho é desativar); 404 inexistente.

### GET /api/ordem-almoco

Permissão: qualquer sessão. Ordem das turmas no almoço de segunda (1) a sábado (6), usada pela consulta diária da aba Horários.

- 200 `{"dias": [{"diaSemana", "itens": [{"turmaId", "posicao", "inicio"}]}]}`, sempre com os seis dias; dia sem ordem vem com `itens` vazio. `posicao` começa em 1 e vem renumerada; `inicio` é `HH:MM` ou `null`.

### PUT /api/ordem-almoco/{dia}

Permissão: administração, com origem confiável e auditoria (`ordem-almoco.definir`). Substitui a ordem do dia inteiro (`dia` de 1 a 6). Corpo `{"itens": [{"turmaId", "inicio"?}]}`, na ordem desejada; lista vazia limpa o dia. As posições são atribuídas pela ordem da lista.

- 200 `{"ordem": {"diaSemana", "itens": [...]}}`.
- 400 para dia fora de 1 a 6, corpo sem `itens`, turma repetida, horário fora de `HH:MM` ou horário anterior ao da posição anterior; 403 sem ser administração; 404 quando alguma turma não existe.

Excluir uma turma a retira da ordem de todos os dias. A cópia JSON inclui a ordem; na restauração, um dia vazio recebe a ordem da cópia e um dia já definido não é sobrescrito.

## Alunos

### GET /api/alunos

Parâmetro opcional `turmaId`. Qualquer sessão.

- 200 `{"alunos": Aluno[]}` de todas as turmas, ordenados por turma e ordem.
- 400 quando `turmaId` não é um identificador válido.

Aluno: `{ id, nome, turmaId, turmaOriginalId, ordem, ativo }`.

### POST /api/alunos

Corpo: `{ "nome": string, "turmaId": string, "turmaOriginalId"?: string }`. A origem padrão é a própria turma; a ordem entra no fim da turma. Apenas administração.

- 201 `{"aluno": Aluno}`; 404 turma inexistente; 403 sem papel de administração.

### PATCH /api/alunos/{id}

Corpo parcial: `{ nome?, turmaId?, turmaOriginalId?, ordem?, ativo? }`.

- 200 `{"aluno": Aluno}`; 404 aluno ou turma inexistente.

### DELETE /api/alunos/{id}

Exclui o aluno e as faltas dele, em cascata.

- 200 `{"ok": true}`; 404 inexistente.

### PATCH /api/alunos

Define a turma de origem de vários alunos de uma vez. A turma atual não muda. Apenas administração, com auditoria.

Corpo: `{ "ids": uuid[], "turmaOriginalId": uuid }`, de 1 a 500 alunos.

- 200 `{"atualizados": number}`; 400 seleção vazia ou inválida; 403 sem papel de administração; 404 turma ou aluno inexistente.

### POST /api/alunos/importacao

Importa a relação de alunos em CSV, no schema padrão descrito em [operacao.md](operacao.md#schema-da-relação-de-alunos) e usado também pela exportação da Gestão. Apenas administração.

Corpo: `{ "csv": string, "aplicar"?: boolean }`, com até 500 mil caracteres.

- Cada linha fora do schema vira um bloqueio com o número da linha e o problema (cabeçalho diferente, número de colunas, campo vazio, ordem inválida ou repetida na turma, nome fora do tamanho).
- Os rótulos de turma casam com o cadastro sem as palavras "ano" e "série" (por exemplo "3º A" com "3º ano A").
- Os alunos casam pelo nome sem acento, sem caixa e com espaços simples, entre os alunos das turmas envolvidas. O aluno encontrado mantém o id e, com ele, todo o histórico.
- Sem `aplicar`, devolve só a prévia. Com `aplicar`, refaz o plano na transação e grava a turma atual, a turma original e a ordem (a posição na relação) de cada aluno, cria quem não existe e desativa, sem excluir, quem está ativo nas turmas importadas e não aparece em nenhuma relação. A auditoria registra só as contagens (`alunos.importar`).

Respostas:

- 200 `{"plano": { itens, desativar, bloqueios, avisos, turmas }, "aplicado": { criados, atualizados, desativados } | null}`. Cada item traz `{ nome, turmaId, turmaOriginalId, ordem, alunoId, mudancas }`, com `alunoId` nulo para aluno novo e `mudancas` entre `turma`, `origem`, `ordem` e `reativar`.
- 400 CSV vazio ou grande demais, ou `aplicar` com bloqueio (linha fora do schema, turma não cadastrada, homônimo no cadastro ou nome repetido no arquivo).
- 403 sem papel de administração ou origem não confiável.

## Usuários (administração)

### GET /api/usuarios

- 200 `{"usuarios": Usuario[]}`.

Usuario: `{ id, nome, email, papel, ativo }`, com papel `ADMIN` ou `COORDENACAO`.

### POST /api/usuarios

Corpo: `{ "nome": string, "email": string, "senha": string, "papel"?: "ADMIN" | "COORDENACAO" }`.

- 201 `{"usuario": Usuario}`.
- 400 senha fora da política, e-mail inválido ou corpo inválido.
- 409 e-mail já usado sem diferenciar caixa.

### PATCH /api/usuarios/{id}

Corpo parcial: `{ nome?, email?, senha?, papel?, ativo? }`. `ativo: false` ou `senha` encerram as sessões e as assinaturas de aviso da conta.

- 200 `{"usuario": Usuario}`.
- 400 quando o alvo é a própria conta com rebaixamento, desativação ou `senha`; a própria senha muda por `POST /api/conta/senha`.
- 409 quando a escola ficaria sem administrador ativo, ou o e-mail já é usado.

### DELETE /api/usuarios/{id}

Exclui a conta. As frequências da escola são preservadas e a autoria fica anulável.

- 200 `{"ok": true}`.
- 400 quando o alvo é a própria conta.
- 409 quando a conta seria o último administrador ativo.

## Frequências

### GET /api/frequencias?dia=YYYY-MM-DD&turmaId=uuid

- 200 `{"frequencia": Frequencia | null, "feriado": Feriado | null}`.
- 400 quando dia ou turma são inválidos.

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas, alunos, aulas, confirmacoesSeduc }`, com `faltas` no formato `[{ alunoId, horarios: string[] }]`, `alunos` com os ids da lista da chamada e `aulas` com o retrato das aulas previstas no dia.

### GET /api/frequencias?mes=YYYY-MM

Parâmetros opcionais `turmaId` e `registradoPor`.

- 200 `{"frequencias": Frequencia[]}` do mês, em ordem de dia e turma.
- 400 quando mês, turma ou autoria são inválidos.

### GET /api/frequencias?dia=YYYY-MM-DD

Sem `turmaId`, devolve o dia inteiro para o Painel.

- 200 `{"frequencias": Frequencia[], "feriado": Feriado | null}` com todas as turmas do dia.
- 400 quando o dia é inválido.

### GET /api/frequencias?de=YYYY-MM-DD&ate=YYYY-MM-DD

Período inclusivo, com `turmaId` opcional.

- 200 `{"frequencias": Frequencia[]}` do período, em ordem de dia e turma.
- 400 quando as datas são inválidas, a final é anterior à inicial ou o período passa de 366 dias.

### POST /api/frequencias

Corpo: `{ "dia": string, "turmaId": string, "faltas": [...], "revisao": number, "sabadoLetivo"?: boolean }`.

Três formas de faltas:

- lista simples de identificadores de aluno: falta em todas as aulas do dia;
- lista de `{ "alunoId": string, "horarios": string[] }`: falta apenas nas aulas informadas;
- lista de `{ "alunoId": string, "justificativa"?: string, "observacao"?: string, "horarios"?: string[] }`: falta com justificativa do catálogo. Sem `horarios`, cobre todas as aulas do dia. A observação é aceita para qualquer código e faz sentido no código `O` (Outros).

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas, alunos, aulas, confirmacoesSeduc }`, com `faltas` no formato `[{ alunoId, horarios, justificativa?, observacao? }]`; os dois últimos campos só aparecem quando há justificativa. `alunos` é a lista da chamada: na primeira gravação, a relação atual da turma; depois, a lista gravada, mais quem entrou na turma quando o dia é o corrente ([ADR-022](adr/022-lista-da-chamada-e-turma-reorganizada.md)). `aulas` é o retrato das aulas previstas no dia, gravado no primeiro salvamento e usado na derivação das marcas; editar a grade depois não reclassifica o histórico ([ADR-044](adr/044-retratos-da-chamada.md)).

Permissão: administração ou coordenação.

Sábado letivo: a Chamada do aplicativo bloqueia todo sábado até a pessoa liberar o sábado letivo, e a rota não exige o campo para salvar sábados com aula na grade. `sabadoLetivo: true` só é aceito no sábado. Se não houver aulas previstas nesse dia, usa as aulas ativas da turma, sem alterar a grade semanal. A grade específica de sábado prevalece quando existe. Correções desses sábados sem grade reenviam a liberação. O registro salvo permite reconhecer o sábado letivo ao reabrir a Chamada, no histórico, na Chamada Parcial e no envio às planilhas. Datas futuras e novas faltas em aulas inativas ou de outra turma continuam recusadas.

Domingo não tem aula nem chamada: a rota responde 400 ("Domingo não tem aula nem chamada.") para qualquer turma, mesmo que uma grade antiga tenha domingo. As chamadas de domingo já salvas continuam sendo lidas.

Feriados cadastrados são recusados com 400 dentro da transação de salvamento, inclusive quando `sabadoLetivo` está ligado. A regra vale para todas as turmas e preserva a grade semanal e os registros existentes. O salvamento e o cadastro de feriado travam a tabela de feriados antes de ler, então, se os dois acontecem ao mesmo tempo para a mesma data, um deles sempre vê o outro: a chamada responde 400 ou o feriado responde 409, nunca os dois aceitos (ver `docs/banco.md`).

Semântica da `revisao`:

- `0` cria a primeira versão. Se já existe frequência do dia e turma, responde 409 com a versão vigente.
- `N` atualiza apenas se a versão vigente for `N`; a divergência responde 409 com a versão vigente.

A consulta por dia inclui `justificativasAntecipadas: [{ id, revisao, alunoId, turmaId, justificativa, observacao }]`; datas futuras e feriados retornam lista vazia. São propostas, sem gravação. O aluno segue sua turma atual após transferência. Na primeira Chamada, o cliente pode enviar `justificativasAntecipadas: [{ id, revisao }]` para confirmar a leitura e permitir correções explícitas da equipe. Qualquer alteração da lista ou revisão responde 409 com `codigo: "JUSTIFICATIVAS_ALTERADAS"`, sem salvar. Clientes antigos que omitem o campo recebem as justificativas automaticamente. Chamadas já salvas seguem sua própria revisão e não reaplicam propostas sobre correções manuais.

Validações: o dia não pode ser futuro (fuso da escola); as aulas precisam pertencer à turma, estar ativas e acontecer no dia da semana; a lista de alunos é revalidada contra os alunos ativos da turma dentro da transação, aceitando quem já tinha falta registrada naquela frequência. O salvamento roda em transação serializável (ADR-007).

Respostas:

- 200 `{"frequencia": Frequencia}` com a revisão incrementada.
- 409 `{"error", "conflito": true, "frequencia": Frequencia}` em duplicata ou revisão obsoleta, inclusive quando a corrida é detectada pelo banco.
- 400 quando faltas apontam alunos de outra turma, aulas de outra turma ou de outro dia, quando a justificativa não pertence ao catálogo, ou quando outra validação falha.
- 401 sem sessão; 403 sem capacidade de operação; 404 turma inexistente.

### POST /api/frequencias/seduc

Permissão: administração ou coordenação, com origem válida. Corpo: `{ dia, turmaId, alunoId, registrado: boolean, revisao, revisaoSeduc }`. Exige chamada salva e aluno na lista histórica.

- 200 `{ confirmacao: { alunoId, registradoSeduc, registradoSeducEm, registradoSeducPorNome, revisaoSeduc } }`.
- 400 em corpo inválido ou aluno fora da lista; 401 sem sessão e 403 sem capacidade de operação ou com outra origem.
- 409 quando a chamada ainda não foi salva, a frequência ou a confirmação mudou, outra chamada passou a ser a base do aluno no dia ou já existe uma personalização. A interface recarrega antes de permitir outra tentativa.

A Chamada Parcial usa esta rota para confirmar alunos cuja origem ainda é a chamada diária salva. A confirmação registra manualmente o lançamento externo, com data e autoria da sessão. Não altera faltas, revisão ou horário de salvamento da chamada, e não envia ao Google. Correções efetivas da chamada invalidam apenas confirmações dos alunos afetados; salvamento sem mudança preserva as confirmações. A revisão própria impede que uma tela antiga refaça uma confirmação desmarcada.

### GET /api/frequencias/resumo?ate=YYYY-MM-DD

Acumulado até a data informada. O parâmetro opcional `de=YYYY-MM-DD` limita a data inicial, inclusive; sem ele, mantém o histórico desde a primeira chamada. A Chamada consulta do primeiro ao último dia do mês exibido.

- 200 `{"resumo": {"primeiroDia": string | null, "diasLetivos": number, "porAluno": [{"alunoId", "faltas", "faltasJustificadas", "diasComRegistro"}]}}`.
- 400 quando uma data é inválida ou `de` é posterior a `ate`.

Um dia com faltas justificadas conta em `faltasJustificadas`; um dia com falta simples ou parcial conta em `faltas`.

### GET /api/frequencias/alertas-beneficios?mes=YYYY-MM

Permissão: qualquer sessão da operação. Devolve um item por aluno ativo e benefício ativo cujas faltas do mês passam do limite da regra do benefício, que é o inteiro de `(100 - percentualMinimoFrequencia)%` das aulas do mês. As aulas do mês somam o retrato das chamadas salvas e a projeção dos demais dias úteis com aulas na grade da turma atual, sem feriados do calendário e sem os dias depois da desistência, usando a carga diária configurada ou a própria grade. Chamadas antigas sem retrato de aulas usam uma estimativa pela carga diária configurada ou pela grade da turma da chamada, inclusive sábado letivo salvo; a lista histórica de alunos permanece respeitada. O alerta conta aulas, enquanto os contadores F e FJ da linha contam dias, e não determina pagamento nem verifica a média anual. A regra de cada benefício define se as faltas justificadas contam. Sem benefício ativo, a lista vem vazia. A regra e o cálculo estão em [beneficios-frequencia.md](beneficios-frequencia.md).

- 200 `{"mes", "alertas": [{"beneficioId", "beneficioNome", "percentualMinimoFrequencia", "aulasPorDia", "faltasJustificadasContam", "alunoId", "aulasFaltadas", "aulasJustificadas", "horasLetivas", "limiteFaltas", "diasLetivos", "aulasDeReferencia"}]}`. `aulasFaltadas` conta o que a regra manda contar, `aulasJustificadas` informa as justificadas de qualquer forma, e exatamente o percentual mínimo de frequência ainda é permitido. `diasLetivos` são os dias com aula que compõem `horasLetivas`. `aulasDeReferencia` é a carga configurada ou, sem ela, a quantidade comum desses dias; fica nula quando os dias não coincidem, e por isso `horasLetivas` pode não ser `diasLetivos` vezes essa carga.
- 400 quando `mes` falta ou não é um mês válido; 401 sem sessão.

### Benefícios e regras de frequência

`aulasPorDia` aceita inteiro de 1 a 30 ou nulo (padrão). Uma quantidade projeta aulas somente nos dias úteis com aulas na grade e sem feriado; nulo usa a quantidade da própria grade. Chamadas salvas mantêm o retrato de aulas e faltas. Chamadas antigas sem retrato usam a carga configurada ou a grade da turma da chamada. O PATCH omitindo o campo mantém a configuração e, com nulo, volta à grade. Leitura, escrita e cópia JSON incluem o campo.

Configuração dos benefícios que alimentam o alerta. Leitura por qualquer sessão; escrita só pela administração, com origem confiável e auditoria. Um benefício é `{ "id", "nome", "percentualMinimoFrequencia", "aulasPorDia", "faltasJustificadasContam", "ativo" }`: nome de 2 a 60 caracteres, único sem diferenciar caixa; percentual inteiro de 1 a 100; `faltasJustificadasContam` falso por padrão; `ativo` verdadeiro por padrão. A migração inicial cadastra uma linha com a regra do incentivo-frequência do Pé-de-Meia, editável como qualquer outra.

- `GET /api/beneficios-frequencia`: 200 `{ "beneficios": [...] }` em ordem alfabética pelo nome, ativos e inativos.
- `POST /api/beneficios-frequencia`: corpo `{ nome, percentualMinimoFrequencia, aulasPorDia?, faltasJustificadasContam?, ativo? }`; 201 `{ "beneficio" }`; 400 em corpo inválido (percentual fora de 1 a 100, fracionado ou em texto, nome curto); 403 sem ser administração; 409 com nome repetido.
- `PATCH /api/beneficios-frequencia/{id}`: corpo parcial com ao menos um dos campos acima; 200 `{ "beneficio" }`; 400 em identificador ou corpo inválido, 404 quando não existe, 409 com nome repetido.
- `DELETE /api/beneficios-frequencia/{id}`: 200 `{ "ok": true }`; 404 quando não existe. Nenhum histórico depende do benefício; para só pausar o alerta, desative pelo `PATCH`.

## Frequências personalizadas e parciais

As rotas exigem sessão da equipe (administração ou coordenação); diretores de turma não operam esses registros. Mutações exigem origem confiável. Presenças personalizadas não alteram a chamada regular. Justificativas são propostas para a primeira Chamada ou corrigem somente o aluno escolhido em chamadas existentes, sem alterar saídas ou entradas. A confirmação manual usa o registro efetivo, seja a base diária ou a personalização.

### GET /api/frequencias-personalizadas

Filtros: `dia` ou o par inclusivo `de` e `ate`, com `turmaId` opcional. Sem datas, consulta o dia corrente da escola. Períodos aceitam até 92 dias.

- 200 `{ "registros": RegistroPersonalizado[] }`, em ordem de dia, nome e identificador. Cada item é uma `FrequenciaParcial`, uma `FrequenciaDaChamada` ou uma `FrequenciaDaSaida`.
- 400 datas inválidas, período incompleto ou invertido, uso simultâneo de dia e período ou turma inválida.

Quando `dia` é informado, a resposta inclui também `feriado: Feriado | null`, consultado no servidor. Consultas por período preservam o formato sem esse campo.

FrequenciaDaChamada: `{ tipo: "CHAMADA", id, alunoId, dia, turmaId, alunoNome, turmaNome, marca, descricao, justificativas, justificativa, observacao, registradoSeduc, registradoSeducEm, registradoSeducPorNome, revisao, revisaoSeduc, criadoEm, atualizadoEm }`. O identificador é `chamada:<alunoId>:<dia>`. `revisao` pertence à chamada; `revisaoSeduc` pertence à confirmação individual. `marca` preserva P, F, FJ ou S; P tem descrição Dia inteiro. `justificativas` contém motivos únicos do catálogo, incluindo os inativos e o complemento de Outros quando preenchido; presença e falta sem justificativa retornam uma lista vazia. Saídas e entradas não inferem aulas frequentadas.

A consulta combina chamadas salvas com personalizações sem copiar nem gravar dados. A personalização prevalece por aluno e dia antes do filtro de turma. Se o aluno integrou mais de uma chamada no dia, vale a mais recentemente atualizada, com desempate pelo identificador. A lista histórica da chamada define os alunos da base, usando seus nomes e os nomes da turma na consulta; sem chamada salva nem personalização, não há registro de presença. Nomes e turma de personalizações existentes continuam históricos.

Itens `SAIDA` incluem `aulas` concluídas antes do horário da saída, `aulasConferiveis`, `assinatura` e `revisaoSeduc`. Personalizações manuais prevalecem sobre saídas, que prevalecem sobre a chamada normal. Sem horário ou grade válidos, a saída pede conferência, sem inventar aulas.

Para confirmar itens `SAIDA`, usar `/api/saidas/{id}/seduc`. Para confirmar itens `CHAMADA`, usar `/api/frequencias/seduc` com ambas as revisões. Para personalizações, usar `/api/frequencias-parciais/{id}/seduc`.

### GET /api/frequencias-parciais

Contrato preservado: lista somente as personalizações gravadas, sem incluir a base diária.

Filtros: `dia` ou o par inclusivo `de` e `ate`, com `turmaId` histórico opcional. Sem datas, consulta o dia corrente da escola. Períodos aceitam até 92 dias.

- 200 `{ "registros": FrequenciaParcial[] }`, em ordem de dia e nome histórico.
- 400 datas inválidas, período incompleto ou invertido, uso simultâneo de dia e período ou turma inválida.

FrequenciaParcial: `{ id, alunoId, dia, turmaId, alunoNome, turmaNome, tipo, justificativa, turno, aulas, observacao, registradoSeduc, registradoSeducEm, registradoSeducPorNome, revisao, criadoEm, atualizadoEm }`. Datas civis usam `YYYY-MM-DD`; instantes usam ISO 8601. Os nomes e a turma retratam a criação, mesmo depois de transferência ou renomeação. Identificadores internos de autoria não são expostos.

### POST /api/frequencias-parciais

Ao personalizar uma saída, incluir `baseSaida: { id, assinatura }` conforme a consulta anterior, com a turma histórica do item. Não combinar com `baseChamada` nem com intervalo de vários dias. Alteração da origem responde 409.

Corpo: `{ alunoId: uuid, turmaId?: uuid, dia: "YYYY-MM-DD", tipo: "DIA_INTEIRO" | "TURNO" | "AULAS" | "JUSTIFICADA", ate?: "YYYY-MM-DD", justificativa?: string | null, turno?: "MANHA" | "TARDE" | null, aulas?: number[], observacao?: string | null, revisao?: number, baseChamada?: { turmaId: uuid, revisao: number } }`.

`DIA_INTEIRO` exige turno nulo ou ausente e lista de aulas vazia; `TURNO` exige Manhã ou Tarde, sem aulas; `AULAS` exige ao menos uma aula entre 1 e 30, sem turno. A aplicação elimina repetições e ordena as aulas. Presenças mantêm observação de até 300 caracteres e recusam data futura. Feriado cadastrado também responde 400, em conferência dentro da transação, inclusive ao corrigir um registro ou personalizar a base da Chamada. As aulas são números da presença personalizada, independentes da configuração de chamada por aula.

Ao criar a partir da base, `baseChamada` confere a revisão, a participação do aluno e a vigência da chamada usada como base e preserva sua turma, inclusive após transferência ou desativação. Se informado, `turmaId` deve corresponder à turma da base. Sem `baseChamada`, registro novo exige aluno ativo e não desistente na data; `turmaId` protege contra transferência concorrente. A personalização guarda nome do aluno e rótulo da turma no momento da criação.

`JUSTIFICADA` exige código do mesmo catálogo da Chamada, sem turno nem aulas. Aceita data futura até 366 dias à frente e observação de até 200 caracteres, guardada somente para Outros. `ate` cria um intervalo inclusivo de até 31 dias civis; domingos e feriados cadastrados são pulados, e a resposta traz os dias efetivamente gravados. O intervalo exige aluno ativo na mesma turma, sem desistência nas datas e sem personalizações sobrepostas; conflito em qualquer dia recusa o lote inteiro. Correções de registros existentes continuam individuais e com revisão.

Sem Chamada salva, a justificativa não cria frequência nem presume presenças. No dia correspondente, aparece na primeira Chamada como FJ em todas as aulas. Havendo chamada salva, corrige somente esse aluno, preserva lista, aulas e colegas, incrementa a revisão e invalida apenas sua confirmação na SEDUC. A fila existente de frequência é acionada quando ligada; falha após a gravação retorna `aviso`, sem transformar um salvamento confirmado em erro. Remover a personalização ou convertê-la em presença não apaga FJ já aplicada: a correção do histórico é feita na Chamada.

- 200 `{ "registro": FrequenciaParcial, "registros": FrequenciaParcial[], "aviso"?: string }` no POST; `registro` é o primeiro dia, preservado para compatibilidade.
- Para criar, a revisão pode ser omitida ou zero. Para corrigir um registro já existente por aluno e dia, é obrigatória a revisão vigente.
- Correção efetiva incrementa revisão e limpa a confirmação da Seduc. Repetir o mesmo conteúdo não altera a confirmação nem a revisão. Nome e turma históricos continuam preservados.
- 400 conteúdo inválido, presença futura, período maior que 31 dias, data além do limite de agendamento ou domingo isolado ("Domingo não tem aula nem chamada."); 404 aluno inexistente; 409 revisão obsoleta, base alterada ou aluno fora da lista salva, transferência concorrente ou aluno desativado/desistente em registro novo sem base.

### POST /api/frequencias-parciais/{id}/seduc

Corpo estrito: `{ "registrado": boolean, "revisao": number }`.

- 200 `{ "registro": FrequenciaParcial }`. Marcar guarda data e nome da conta autenticada; desmarcar limpa confirmação e responsável. Alteração incrementa revisão; repetir o mesmo estado é idempotente.
- 400 corpo ou identificador inválido; 404 registro inexistente; 409 revisão obsoleta.

A chave confirma manualmente que a revisão corrente foi lançada no sistema da Seduc. Não envia dados para esse sistema e não confirma a gravação na planilha Google.

### DELETE /api/frequencias-parciais/{id}

Corpo: `{ "revisao": number }`.

- 200 `{ "ok": true }`, com auditoria. Remove a personalização e limpa as confirmações da base desse aluno no dia, incrementando todas as revisões `revisaoSeduc` correspondentes, mesmo quando a chave já estava desligada. A próxima consulta volta à chamada salva, quando disponível; as faltas diárias permanecem intactas.
- 400 corpo ou identificador inválido; 404 inexistente; 409 revisão obsoleta.

## Saídas antecipadas

### GET /api/saidas

Filtros: `dia`, `de` e `ate` (período inclusivo), `alunoId` e `turmaId` (turma atual do aluno). É preciso informar ao menos um.

- 200 `{"saidas": Saida[]}` em ordem de dia e registro.
- 400 quando algum parâmetro é inválido ou o período está invertido.

Saida: `{ id, alunoId, dia, momento, horario, justificativa, observacao, texto, liberadoPorId, liberadoPorCodigo, liberadoPorNome, criadoEm }`. `justificativa` é nula quando o motivo foi escrito. `liberadoPorNome` resolve o rótulo atual do catálogo de quem libera ou, nos registros antigos, o nome da conta.

### POST /api/saidas/{id}/seduc

Sessão da operação e origem confiável. Corpo `{ "registrado": true, "revisao": 0, "assinatura": "<64 caracteres hexadecimais>" }`, usando a assinatura e a revisão da consulta de registros personalizados. Responde 200 `{ "registro": FrequenciaDaSaida }`. Revisão ou aulas alteradas, origem removida, falta de grade ou existência de personalização respondem 409. Confirmar não envia dados à SEDUC. Alterar a grade ou as faltas da base invalida a confirmação exibida; personalizar exige nova conferência se a saída voltar a ser a base.

### POST /api/saidas

Corpo: `{ "alunoId": string, "dia": "YYYY-MM-DD", "momento": string, "horario": "HH:MM", "justificativa"?: string, "texto"?: string, "observacao"?: string, "liberadoPorCodigo": string }`.

A justificativa é um código do catálogo ou um `texto` de até 100 caracteres. Sem código, o texto é o motivo e vale em qualquer momento. Com código, o `texto` é opcional e só vale na aula; a `observacao` vale para intervalos e almoço. `liberadoPorCodigo` é um código do catálogo de quem libera.

- 201 `{"saida": Saida}`.
- 400 para momento inválido, horário ausente ou fora de `HH:MM`, justificativa fora do catálogo, texto e tipo ausentes, aluno inválido, dia inválido, domingo, data futura ou responsável fora do catálogo. Domingo responde com a mensagem Domingo não tem aula. Escolha um dia de segunda a sábado.
- 404 aluno inexistente; 409 quando o aluno desativado ou já tem saída no dia.

### DELETE /api/saidas/{id}

Remove a saída para correção.

- 200 `{"ok": true}`; 404 inexistente.

## Relatórios

### GET /api/relatorios/movimentacoes?de=YYYY-MM-DD&ate=YYYY-MM-DD&turmaId=uuid

Exige capacidade `operar` (administração ou coordenação). Consulta somente os dados locais, sem escrever registros ou acessar o Google. `de` e `ate` são obrigatórios, inclusivos e aceitam fins de semana. O intervalo deve conter datas válidas, em ordem, até o dia corrente do fuso da aplicação e no máximo 366 dias. `turmaId` é opcional e deve ser UUID.

Retorna `{ de, ate, totais: { saidas, entradas, total }, turmas }`. Cada grupo traz `turmaId`, `turmaRotulo`, `saidas`, `entradas`, `total` e `movimentacoes`. Cada movimentação traz `id`, `tipo` (`SAIDA` ou `ENTRADA`), `alunoId`, `alunoNome`, `dia`, `horario`, `momento`, `motivo` e `responsavel`; horário, momento e responsável podem ser nulos. Motivos incluem complementos e os rótulos dos catálogos, mesmo desativados. Entradas usam o responsável pelo registro, com fallback para a autoria legada; saídas usam o nome do liberador, com fallback para o usuário que liberou.

Entradas são agrupadas e filtradas pela turma registrada no evento; saídas, pela turma atual do aluno. O agrupamento considera o identificador e o rótulo da turma para preservar renomeações históricas. Inclui alunos inativos e registros sem chamada no dia. Grupos seguem a ordem natural do rótulo; registros seguem data, horário (ausentes por último), nome, tipo e identificador. Sem registros, retorna totais zerados e `turmas: []`. Parâmetros inválidos retornam 400; sem sessão, 401; diretor de turma, 403.

## Configurações

### GET /api/configuracoes

- 200 `{"configuracoes": {"frequenciaPorAula": boolean, "saidaAntecipada": boolean, "origemNaChamada": boolean, "origemNaChamadaSerieIds": string[], "origemNaChamadaTurmaIds": string[], "infrequenciaAtencaoPercentual": number, "infrequenciaCriticaPercentual": number, "feriados": Feriado[], "atualizadoEm": string}}`. Qualquer sessão. O calendário traz todos os anos, em ordem de data. Os limites de infrequência são inteiros de 0 a 100, com atenção menor que crítica, e começam em 10 e 20. `atualizadoEm` é a versão da última gravação.

### PATCH /api/configuracoes

Corpo parcial: `{ frequenciaPorAula?, saidaAntecipada?, origemNaChamada?, origemNaChamadaSerieIds?, origemNaChamadaTurmaIds?, infrequenciaAtencaoPercentual?, infrequenciaCriticaPercentual?, atualizadoEm? }`. Apenas administração, com auditoria. Os limites devem ser inteiros de 0 a 100 e a atenção deve ficar abaixo da crítica; quando só um deles é enviado, a API compara com o valor vigente e recusa a dupla inválida.

As listas aceitam até 500 UUIDs existentes cada, sem duplicatas na resposta. A seleção é a união das séries completas com as turmas avulsas. Lista vazia não habilita nenhuma turma; alterar somente `origemNaChamada` preserva as seleções. Desligar controla apenas a exibição, sem modificar alunos, chamadas ou planilhas. Seleção inexistente responde 400 e não altera a configuração. Ao enviar `atualizadoEm`, a gravação só acontece se a versão ainda for a vigente; caso contrário responde 409 com a mensagem para revisar antes de salvar.

- 200 `{"configuracoes": Configuracoes}`; 400 corpo inválido; 409 configurações alteradas em outro acesso; 403 sem papel de administração.

### GET /api/configuracoes/completo

Apenas administração. Devolve o conjunto usado pelo rascunho único:

- 200 `{ configuracoes, notificacoes, acesso, ordemAlmoco, beneficios, justificativas, liberadores, feriados, chavesBi, planilhas, revisoes }`.
- `revisoes` é um mapa por seção (`configuracao`, `infrequencia`, `notificacoes`, `acesso`, `ordemAlmoco`, `beneficios`, `justificativas`, `liberadores`, `feriados`, `chavesBi`, `planilhas`). As chaves do BI saem sem segredo e a revisão ignora os contadores de uso, que mudam a cada consulta. A seção `infrequencia` cobre os dois limites do Painel, separada de `configuracao` para não marcar duas seções pelo mesmo motivo.
- `planilhas` traz `ativa` e `envioAutomatico` de `frequencia`, `saidas` e `parcial`. Estrutura, mapa, modo completo e visibilidade mensal continuam imediatos porque dependem de leitura ou ação no Google.
- 401 sem sessão; 403 sem papel de administração; 503 falha temporária.

### POST /api/configuracoes/lote

Administração e origem confiável. Corpo:

```json
{
  "revisoes": { "justificativas": "hash-lido", "notificacoes": "hash-lido" },
  "desejado": {
    "justificativas": [{ "codigo": "D", "rotulo": "Doente", "ativo": true }],
    "notificacoes": {
      "resumoDiario": true,
      "novasChamadas": true,
      "chamadasPendentes": false,
      "horarioResumo": "17:00",
      "horarioPendencias": "17:00"
    },
    "chavesBi": [{ "id": "novo-uuid", "rotulo": "Painel", "escopo": {} }],
    "limparChavesBi": false,
    "planilhas": {
      "frequencia": { "ativa": true, "envioAutomatico": false },
      "saidas": { "ativa": true, "envioAutomatico": false },
      "parcial": { "ativa": false, "envioAutomatico": false }
    }
  },
  "senhaBi": "senha-do-administrador"
}
```

Cada seção enviada traz o estado completo desejado, inclusive catálogos. A gravação acontece em uma única transação serializável: se qualquer revisão divergir, responde 409 com `codigo: "CONFIGURACOES_ALTERADAS"` e a lista das seções, sem gravar nada. Exclusões bloqueadas por histórico respondem 409 com `codigo: "JUSTIFICATIVA_EM_USO"` ou `"LIBERADOR_EM_USO"`. Chaves do BI exigem `senhaBi`; sem ela, 400 com `codigo: "SENHA_BI_OBRIGATORIA"`. Senha incorreta responde 400; excesso de tentativas, 429. O retorno traz o conjunto atualizado e `segredosBi`, com o segredo das chaves criadas ou substituídas apenas nessa resposta. `limparChavesBi` remove as chaves revogadas e expiradas do histórico.

- 200 `{ completo, segredosBi }`; 400 corpo ou senha inválidos; 401 sem sessão; 403 sem papel ou origem; 409 conflito de revisão ou catálogo em uso; 503 falha temporária.

## Calendário letivo

`Feriado` é `{ dia: "YYYY-MM-DD", nome: string }`. Cada data vale para a escola inteira apenas no ano informado, sem repetição anual automática. Datas precisam existir no calendário e pertencer a um ano entre 1900 e 2199; o nome é aparado e deve ter entre 1 e 120 caracteres.

| Rota                                  | Permissão e contrato                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/calendario-letivo?ano=YYYY` | Sessão da equipe. 200 `{ feriados: Feriado[] }`, em ordem de data; sem `ano`, lista todos os anos. Ano inválido responde 400.                                                                    |
| `POST /api/calendario-letivo`         | Administração e origem confiável. Corpo estrito `{ dia, nome }`; 201 `{ feriado: Feriado }`. Data já cadastrada ou com chamada regular ou parcial salva responde 409, sem modificar o histórico. |
| `DELETE /api/calendario-letivo/{dia}` | Administração e origem confiável. 200 `{ ok: true }`; 400 para data inválida e 404 quando não existe feriado nessa data. Remove somente o feriado.                                               |

Mutações registram auditoria, executam em transação serializável e compartilham a trava do preparo e do envio da frequência às planilhas. Não há alteração de aulas, alunos ou frequências; após excluir o feriado, a data volta a seguir a grade semanal. A administração não pode transformar em feriado uma data que já tenha frequência salva. A leitura permanece sem cache; 401 indica ausência de sessão e 403 indica papel ou origem não permitidos.

### GET /api/calendario-letivo/sincronizacao

Administração. 200 `{ sincronizado, configurado, abrangencia }`. `sincronizado` é verdadeiro quando existe ao menos um feriado importado, em qualquer ano. `configurado` indica se o token da base está no servidor. `abrangencia` é `nacionais`, `estaduais` ou `municipais`, conforme `FERIADOS_IBGE`, `FERIADOS_UF` ou o padrão nacional. A resposta não traz o token.

### POST /api/calendario-letivo/sincronizar

Administração e origem confiável. Corpo estrito `{ ano, prova? }`. 200 `{ gravados, atualizados, mantidos, ignorados, sincronizado }`. A consulta percorre todas as páginas do ano, sem pontos facultativos, e grava as datas ainda ausentes com origem importada. Nome de feriado importado pode ser atualizado; feriado cadastrado à mão na mesma data é preservado. Data com chamada regular ou parcial salva entra em `ignorados` e não vira feriado. Se já existe feriado importado, `prova` é obrigatória; sem ela a resposta é 409 e a base não é consultada. Prova inválida, de outro administrador, de outro ano ou expirada responde 400. Lista vazia responde 400, sem gravar. Base sem token ou credencial recusada responde 503. A gravação usa a mesma trava e a mesma transação serializável do cadastro manual.

### POST /api/calendario-letivo/sincronizar/desbloqueio

Administração e origem confiável. Corpo estrito `{ ano, senha }`. 200 `{ prova }`. A senha é a do administrador, com o mesmo limite de tentativas das outras confirmações. A prova vale dez minutos, só para aquele administrador e aquele ano, e não contém a senha. Senha incorreta responde 400; excesso de tentativas responde 429.

## Justificativas

### GET /api/justificativas

- 200 `{"justificativas": [{"codigo", "rotulo", "ativo"}]}` em ordem alfabética pelo rótulo. Qualquer sessão.

### POST /api/justificativas

Corpo: `{ "codigo": string, "rotulo": string }`. Apenas administração, com auditoria.

- 201 `{"justificativa": Justificativa}`.
- 400 código fora do formato (letras e números, começando por letra, até 10) ou rótulo fora de 2 a 60 caracteres.
- 403 sem papel de administração; 409 código repetido sem diferenciar caixa.

### PATCH /api/justificativas/{codigo}

Corpo parcial: `{ rotulo?, ativo? }`. O código não muda, porque o histórico guarda o código.

- 200 `{"justificativa": Justificativa}`; 404 inexistente; 400 corpo inválido.

### DELETE /api/justificativas/{codigo}

- 200 `{"ok": true}`.
- 409 quando há faltas ou saídas usando o código, com a orientação de desativar.
- 404 inexistente.

## Quem libera

### GET /api/liberadores

- 200 `{"liberadores": [{"codigo", "rotulo", "ativo"}]}` em ordem alfabética pelo rótulo. Qualquer sessão.

### POST /api/liberadores

Corpo: `{ "codigo": string, "rotulo": string }`. Apenas administração, com auditoria.

- 201 `{"liberador": Liberador}`.
- 400 código fora do formato (letras e números, começando por letra, até 20) ou rótulo fora de 2 a 60 caracteres.
- 403 sem papel de administração; 409 código repetido sem diferenciar caixa.

### PATCH /api/liberadores/{codigo}

Corpo parcial: `{ rotulo?, ativo? }`. O código não muda, porque o histórico guarda o código.

- 200 `{"liberador": Liberador}`; 404 inexistente; 400 corpo inválido.

### DELETE /api/liberadores/{codigo}

- 200 `{"ok": true}`.
- 409 quando há saídas usando o código, com a orientação de desativar.
- 404 inexistente.

## Responsáveis

### GET /api/responsaveis

- 200 `{"responsaveis": [{"id", "nome", "papel"}]}` com a equipe ativa que pode liberar saídas. Qualquer sessão.

## Planilha

Integração opcional com Google Planilhas (ver [planilha.md](planilha.md)). Na conexão OAuth, o token de atualização nunca sai do servidor; um token de acesso breve chega ao navegador somente para o Picker. Mutações exigem origem confiável; a configuração é restrita à administração, e o envio aceita qualquer sessão ativa.

### Conexão OAuth das três finalidades

- `POST /api/planilha/google/iniciar`: recebe `{ "finalidade": "FREQUENCIA" | "SAIDAS" | "PARCIAL", "reconectar"?: boolean, "mes"?: "YYYY-MM" }`, cria estado assinado e URL de autorização para a administração. Retorna `{ "url": string }` e define cookie de curta duração. Reconexão exige arquivo e autorização anteriores; o estado assinado vincula a configuração atual e o mês opcional.
- `GET /api/planilha/google/retorno`: recebe o código OAuth, confere estado e sessão, guarda o token de atualização cifrado e redireciona ao aplicativo. Na reconexão, confirma acesso ao mesmo arquivo e recusa conexão alterada durante o OAuth; atualiza apenas a credencial, preservando mapa e preferências. Retorna `google=reconectado` ou `google=erro_reconexao`, com `googleFinalidade` e o `googleMes` assinado quando informado. Nenhuma escrita na planilha é disparada pelo retorno.
- `GET /api/planilha/google/acesso?finalidade=FREQUENCIA|SAIDAS|PARCIAL`: entrega ao administrador um token de acesso breve e a configuração pública do Google Picker; nunca entrega o token de atualização. A conta já conectada à frequência pode selecionar os arquivos de saídas e chamadas parciais.
- `POST /api/planilha/google/selecionar`: recebe `{ "id": string, "finalidade": "FREQUENCIA" | "SAIDAS" | "PARCIAL" }`, confere acesso pela Sheets API e guarda a planilha da finalidade. Trocar de arquivo desliga a integração e `envioAutomatico`, invalida o mapa anterior e redefine o modo para conservador com `modoCompletoAte: null`; selecionar o mesmo arquivo preserva a estrutura e as opções. A finalidade `PARCIAL` exige arquivo distinto dos arquivos das outras duas finalidades; a mesma restrição vale ao trocar o arquivo de frequência ou saídas.

Erros externos de autorização usam `{ "error": string, "codigo": string }`: `GOOGLE_RECONECTAR` (409), `GOOGLE_CONFIGURACAO` (503) ou `GOOGLE_TEMPORARIO` (502/503). A leitura de planilhas também identifica `GOOGLE_ACESSO` (403) e classifica como `GOOGLE_TEMPORARIO` o limite de leituras (429 do Google, respondido como 503), as falhas 5xx e a falta de resposta do Google (502). Assim o preparo mensal interrompe o lote uma vez, mantém as turmas restantes como não preparadas e oferece "Tentar pendentes". Respostas de leitura que antes saíam como 429 ou sem código passam a sair com esse código. O status 401 permanece reservado à sessão do aplicativo.

### GET /api/planilha/estado

- 200 `{"estado": {"ativa", "modo", "modoCompletoAte", "podeEnviar", "alteradasDepois"}}`. `alteradasDepois` conta chamadas ainda pendentes, considerando confirmação por dia, origem e destino atual. Qualquer sessão.

### GET /api/planilha e PATCH /api/planilha

Leitura e edição da configuração: `{ ativa?, envioAutomatico? }`. `envioAutomatico` liga o envio da chamada à planilha logo depois de salva (ADR-025); começa desligado. Apenas administração. A resposta informa a conexão Google e o arquivo selecionado, sem credenciais. Ativar exige conta Google e arquivo selecionados. Habilitar a automação da frequência, ou reativar uma integração que a mantinha ligada, exige integração ativa, modo conservador e mapa salvo não vazio com vínculos válidos e únicos por turma e período. Condição não atendida ou conexão alterada durante a operação responde 409. Desligar a integração ou a automação continua permitido. Campos antigos como `endpoint` são recusados.

- 200 `{"integracao": {...}}`; 400 configuração inválida ou conexão Google incompleta; 403 sem papel de administração; 409 para configuração incompatível com automação ou conexão alterada.

### POST /api/planilha/estrutura

Corpo opcional e estrito: `{ "mes"?: "YYYY-MM" }`; corpo ausente também é aceito. Lê o esquema de todas as abas e sugere o mapa por turma de origem. Com mês informado, relê os cabeçalhos das abas desse mês e das abas legadas; os demais meses podem reutilizar a estrutura salva quando a identidade corresponde. Sem mês, mantém essa reutilização para as abas mensais. Um mês inválido responde 400. Retorna `conferenciaHash`, assinatura de 64 caracteres hexadecimais minúsculos que vincula arquivo, credencial, revisão da configuração e estrutura lida. A assinatura não expõe credenciais e não tem prazo fixo; mudanças nesses dados a invalidam.

- 200 `{ "planilha", "abas", "sugestoes", "problemas", "conferenciaHash" }`. Apenas administração.

### POST /api/planilha/mapa

Corpo: `{ "conferenciaHash": string, "planilha": {...}, "abas": AbaEsquema[], "mapa": [{"aba", "turmaOriginalId", "mes"?, "destino"?}] }`. Reenviar `planilha` e `abas` exatamente como retornados por `/estrutura`; somente o `mapa` é editável. Salva o esquema e a assinatura após conferir o hash, também dentro da transação. Alteração de arquivo, credencial, opções, revisão ou estrutura salva exige nova leitura. Preparar um mês depois da leitura também invalida a conferência anterior.

- 200 `{"integracao": {...}}`; 400 para hash ausente, formato inválido ou aba inválida; 404 para turma inexistente; 409 para conteúdo adulterado ou conferência desatualizada.

### GET /api/planilha/diagnostico

Apenas administração. Query obrigatória `mes=YYYY-MM`, com mês válido. Retorna `{ "diagnostico": DiagnosticoPlanilha }`. A consulta só lê o Google, funciona com a integração pausada e não altera configuração, mapa, abas ou envios.

`DiagnosticoPlanilha` contém `mes`, `conferidoEm`, `conexao: { conectada, verificada, erro }`, `ativa`, `modo`, `envioAutomatico`, `estruturaPronta`, `resumo: { total, prontas, semAba, revisar }`, `turmas`, `alteradasDepois` e `ultimoErro`. Cada turma contém `{ id, rotulo, tipo, aba, situacao, mensagem }`, com `tipo` mensal, legado ou ausente e `situacao` pronta, sem_aba, estrutura_alterada, bloqueada ou indisponivel.

A conferência valida existência da aba, cabeçalho, mesclagens, vínculo e identificação mensal. Limita a leitura a cabeçalhos nas primeiras 12 linhas e até 400 colunas. Turmas que já usam abas mensais não voltam ao legado quando falta o mês escolhido. `estruturaPronta` requer acesso verificado, ao menos uma turma e todas as estruturas conferidas; não comprova gravação de marcas nem resolve nomes ou frequências divergentes. A prévia do envio continua responsável por conferir alunos e células. `alteradasDepois` e `ultimoErro` refletem as pendências da integração, sem recorte pelo mês consultado.

Falhas conhecidas de acesso ao Google ou de leitura de uma aba são apresentadas em `conexao.erro` e nas situações por turma, sem transformar estrutura não lida em pronta. Alteração de arquivo, credencial ou esquema durante a consulta responde 409.

- 200 com diagnóstico; 400 para mês ausente ou inválido; 401 sem sessão; 403 sem administração; 409 para configuração alterada durante a leitura.

### POST /api/planilha/mensal

Corpo: `{ "turmaOriginalId": UUID, "mes": "AAAA-MM" }`. Exige administração e origem confiável. Prepara uma turma por requisição, com Aluno, datas de segunda a sexta, sábados com chamada salva daquela origem, alunos e vínculos. O título usa o mês por extenso, como `1º A · Outubro`; em colisão com a mesma turma e mês de outro ano, acrescenta o ano. Em uma aba mensal existente, renomeia e remove somente colunas próprias reconhecidas de Turma atual, domingos e sábados sem chamada salva para aquela origem, preservando linhas, demais células e destino. Repetição reutiliza o destino já ajustado. Aba manual com o mesmo nome, estrutura inesperada ou outra atualização em andamento responde 409.

Feriados são lidos no servidor sob a mesma trava e omitidos das datas mensais. Em abas existentes, uma coluna própria de feriado só é removida após conferir todas as linhas: valor, fórmula ou nota abaixo do cabeçalho responde 409 e impede a escrita. A leitura aceita até 20.000 linhas e limita cada bloco a 20.000 células; dimensões ausentes ou maiores impedem a remoção. Colunas manuais permanecem preservadas. O marcador histórico `frequenciapp.feriado` permite reconhecer uma data omitida; excluir o feriado não recria a coluna imediatamente, e o envio posterior pode inserir a data que voltou a ser letiva.

- 200 `{ "aba", "mes", "turmaOriginalId", "destino", "criada", "atualizada" }`; `atualizada` é verdadeira apenas quando a aba existente foi ajustada; 400 mês inválido; 404 turma inexistente; 429 excesso de preparos.
- Depois do primeiro preparo de uma turma, cada mês exige a própria aba preparada. Mapa aceita a mesma turma em meses diferentes; o servidor confere a identificação mensal no Google e preserva meses preparados durante outra conferência.

### GET /api/planilha/mensal/visibilidade

Apenas administração. Retorna `{ "abas": [{"aba", "mes", "turmaOriginalId", "destino", "oculta", "url"}], "legadas": [{"aba", "turmaOriginalId"}] }`. Os links apontam diretamente para a turma no Google Planilhas. Os meses incluem o ano e são ordenados do mais recente ao mais antigo; abrir o catálogo não grava nada.

### POST /api/planilha/mensal/visibilidade

Corpo: `{ "mes": "AAAA-MM" }`. Exige administração e origem confiável. Libera todos os meses preparados e as abas legadas reconhecidas no mapa. Nenhum mês é ocultado. Abas manuais sem vínculo e cópias antigas permanecem intactas. Usa a mesma trava do preparo e envio; não repete automaticamente uma escrita com resposta perdida.

- 200 `{ "mes", "visiveis": string[], "ocultadas": [] }`. O campo `ocultadas` permanece por compatibilidade.
- 400 mês inválido; 409 mês sem abas preparadas ou alteração concorrente; 429 excesso de alterações.
- Preparar mês chama esta operação ao concluir todas as turmas. Falha não desfaz o preparo; Meses da frequência permite conferir e liberar o acesso depois.

### POST /api/planilha/mensal/legado

Corpo: `{ "aba": string, "planoHash"?: string, "descartarComplementos"?: boolean, "senha"?: string, "resolucoes"?: Resolucao[] }`, limitado a 1.000.000 bytes. Apenas administração e origem confiável. Sem hash, retorna `{ "previa": {"aba", "impressao", "planoHash", "preenchidas", "conferidas", "substituidas", "mantidas", "alunosIncluidos", "resolucoesAplicadas", "totalPendencias", "pendencias", "destinos", "complementos", "urlAntiga", "removida": false} }`, sem escrever. A assinatura vincula a conferência ao administrador, conexão, turma e escolhas. Com hash válido e sem pendências, relê as abas e reúne inclusões, marcas e retirada em um único lote atômico. Retorna `{ "removida": true, "aba" }` e atualiza o mapa e a auditoria.

A origem precisa ter vínculo salvo e cabeçalho Aluno na primeira coluna e linha. Datas usam ano completo. O código estável identifica o aluno e nomes diferentes com o mesmo código exigem escolha explícita da linha; sem código dos dois lados, somente nomes únicos nas duas abas são associados automaticamente, desconsiderando caixa e espaços repetidos. Códigos diferentes nunca são associados pelo nome. Homônimos, alunos ausentes e marcas divergentes retornam pendências estruturadas na prévia, com aluno, mês, data quando aplicável, marcas e links para as células. Até 200 detalhes são devolvidos por vez, sem reduzir `totalPendencias`; a confirmação com qualquer pendência responde 409.

`resolucoes` aceita até 5.000 escolhas únicas: `{ tipo: "aluno", mes, linhaAntiga, linhaMensal }` escolhe uma linha compatível de homônimo; `{ tipo: "adicionar-aluno", mes, linhaAntiga }` inclui o aluno ausente em uma linha vazia do mês, preservando o código conhecido e sem mudar o cadastro; `{ tipo: "frequencia", mes, celulaAntiga, manter: "antiga" | "mensal" }` decide uma marca divergente. Linhas começam em 1 e devem estar entre 2 e 2.000. O destino precisa corresponder ao nome ou código, e duas origens não podem apontar para a mesma linha. Não é permitido incluir outra linha se já houver destino compatível. Cada alteração exige nova prévia, sem hash, com as mesmas escolhas reenviadas na confirmação. Escolhas aplicáveis exigem senha administrativa válida; senha ausente ou incorreta responde 400. As marcas sem conflito só preenchem células vazias. Escolhas nunca autorizam sobrescrever fórmulas, notas ou conteúdo não visível.

Todos os alunos da origem precisam estar preservados nos destinos. Turma atual é redundante e pode ser descartada; colunas não reconhecidas impedem a transferência. A prévia informa contagens de fórmulas de totais, notas e totais numéricos, com até 18 coordenadas de exemplo e link para a aba antiga. O texto das notas e fórmulas não é devolvido ao navegador. Se esses complementos existirem, a confirmação exige `descartarComplementos: true` e senha administrativa válida; autorização ausente responde 409 e senha ausente ou incorreta responde 400. A senha usa o limitador administrativo existente. Fórmulas no cabeçalho, nomes ou datas, gráficos, mesclagens e datas sem destino continuam respondendo 409. Cada aba aceita até 2.000 linhas e 400 colunas, lidas integralmente em blocos de até 20.000 células. A assinatura também considera o conteúdo real das notas, fórmulas e valores, inclusive quando o resultado exibido não muda. A prévia vencida ou conexão alterada exige nova conferência; 429 limita a repetição de pedidos. Escrita com resposta perdida nunca é repetida automaticamente.

Resposta perdida exige conferir a planilha e atualizar a estrutura, sem repetição automática. A Google Sheets API não oferece comparação e gravação condicionais: uma edição externa depois da última leitura ainda pode competir com o lote. A transferência não altera chamadas no aplicativo nem cria abas de backup.

### POST /api/planilha/simular

Corpo: `{ "turmaOriginalId"?, "todas"?: boolean, "de", "ate", "somenteAlteradas"?: boolean, "permitirInserirColunas"?, "permitirNovosAlunos"?, "substituirDivergencias"?, "limparCelulas"?, "removerLinhas"?, "removerColunas"? }`. Período de até 92 dias. Com `todas`, monta um plano por destino mapeado. Abas mensais recebem segunda a sexta e sábados com chamada salva daquela origem no mês e retornam `mes` e `aba`; um intervalo entre meses gera vários planos para a mesma turma. O hash inclui a aba e sua identidade. `somenteAlteradas` (padrão verdadeiro) limita cada turma aos dias sem `SUCESSO` que cubra a data e sua atualização, sem células puladas; falso usa o período inteiro, incluindo nas abas mensais somente dias úteis e sábados com chamada salva. Devolve a prévia, o `planoHashGeral` e, por turma, `dias`, `semEnvio` (nada a enviar), `planoHashTurma` (o hash do envio só daquela turma) e `bloqueado` quando a estrutura impede a escrita.

Abas legadas usam destino derivado de arquivo e `abaId`, o identificador estável do Google, também presente no esquema quando disponível. O catálogo é relido antes de calcular dias incrementais. Se o `abaId` salvo já existe e difere do Google, a prévia e o envio respondem 409 até conferir a estrutura e salvar o mapa novamente; uma aba recriada com o mesmo nome é outro destino. Somente estruturas antigas sem `abaId` recebem essa identificação automaticamente. Renomear e mapear novamente a mesma aba conserva sua identidade e as confirmações anteriores. Sucessos antigos sem destino permanecem no histórico, mas não confirmam o arquivo atual; a primeira prévia após a atualização pode exigir nova conferência conservadora. Resultados parciais antigos sem destino bloqueiam automação até conferência manual posterior.

- 200 com planos e resumos; 400 sem estrutura ou período inválido; 429 prévias em excesso; 502 sem resposta da planilha.

### POST /api/planilha/aplicar

Uma turma por requisição: `turmaOriginalId` obrigatório, `todas` recusado. Mesmo corpo da simulação mais `planoHashGeral`, que é o `planoHashTurma` da prévia. Informar `aba` para aplicar apenas o destino correspondente ao `planoHashTurma`, mantendo o período original da prévia. Recalcula o plano, exige o mesmo hash e envia. Operações destrutivas exigem o modo completo. O registro nasce `PARCIAL` antes da chamada ao Google e vira `SUCESSO` com a resposta; o envio nunca é repetido automaticamente. Depois de criar coluna ou linha, a estrutura da aba é relida e salva.

- 200 `{"resultados", "resumo"}`; cada resultado é `sucesso`, `parcial` (sem confirmação: timeout ou queda depois de enviar, com a mensagem para conferir a aba), `falha` (recusa antes da escrita) ou `sem_envio`.
- 400 sem prévia ou com `todas`; 409 quando os dados mudaram; 429 envios em excesso.

### POST /api/planilha/modo-completo

Corpo: `{ "frase": "EDITAR PLANILHA", "senha": string, "duracaoMinutos"?: 5 | 15 | 30 | 60 }`. Apenas administração.

- 200 `{"modo": "completo", "modoCompletoAte"}`; 400 frase, senha ou duração inválidas; 429 tentativas em excesso.

### POST /api/planilha/modo-conservador

Volta ao modo conservador. Qualquer sessão.

- 200 `{"modo": "conservador"}`.

### GET /api/planilha/copias?aba=...

Lista as cópias ocultas de uma aba. Apenas administração.

### POST /api/planilha/restaurar

Corpo: `{ "aba", "copia", "frase", "senha" }`. Troca a aba pela cópia, sem criar outra cópia e invalidando o esquema. Apenas administração.

- 200 `{"aba", "copia", "anterior"}`; 400 frase ou senha inválidas; 502 falha na planilha.

### POST /api/planilha/organizar, /api/planilha-saidas/organizar e /api/planilha-entradas/organizar

Somente administração, com origem válida. Corpo `{ aba }` retorna `{ previa }`, com linha do cabeçalho, assinatura, colunas reconhecidas e suas larguras, além de `planoHash`. Essa etapa apenas lê a planilha. A confirmação envia `{ aba, planoHash }` e retorna `{ organizada: true, aba }`, depois de reler e conferir a prévia. Alteração do arquivo, da conexão ou do cabeçalho responde 409 e exige nova prévia. A apresentação é registrada em `planilha.organizar`; valores, fórmulas, formatos numéricos e rótulos não mudam. Não há repetição automática da escrita. A aba Entradas usa a conexão Google de saídas e seu cabeçalho padrão.

Somente em `/api/planilha/organizar`, `{ aba, ajustarCabecalho: true, anoReferencia?: number }` retorna uma prévia com `ajusteCabecalho`: quantidade de linhas introdutórias reconhecidas a remover e datas a corrigir para `dd/mm/aaaa`. A confirmação repete esses campos e inclui `planoHash`. O ano deve estar entre 2000 e 2100; datas com ano explícito orientam os rótulos curtos próximos. A operação não cria cópias internas, recusa fórmulas nas células afetadas ou introdução não reconhecida, preserva os dados da tabela e atualiza o esquema mantendo o mapa. Mesclagens somente na introdução podem ser removidas; mesclagens na tabela continuam bloqueadas.

A organização coletiva reutiliza `/api/planilha/organizar` com `{ aba, emLote: true }`, além dos campos de correção quando necessários. Só aceita abas do mapa salvo de frequência. O cliente confere todas as abas e confirma cada plano em sequência, mantendo as requisições curtas. A assinatura coletiva vincula cada prévia ao arquivo, às credenciais e ao mapa; atualizações do cache de esquema causadas por outra aba não a invalidam. Mudanças no cabeçalho continuam exigindo nova prévia. Abas com falha na prévia não recebem confirmação; falhas de escrita não provocam repetição automática.

### POST /api/planilha/criar-aba

Corpo: `{ "nome": string, "cabecalho"?: string[] }`. Cria uma aba nova com cabeçalho mínimo e marcador da integração. Apenas administração.

- 200 `{"aba": string}`; 400 nome inválido ou repetido; 502 falha na planilha.

### POST /api/planilha/remover-aba

Corpo: `{ "aba", "frase", "senha" }`. Exige o modo completo ativo e remove apenas aba com marcador da integração, sem criar cópia interna. Apenas administração.

- 200 `{"aba": string}`; 400 frase, senha ou modo inválidos; 502 quando a aba não foi criada pela integração.

### POST /api/planilha/desconectar

Apaga a autorização OAuth e o esquema e desliga a integração. Apenas administração. A planilha não é alterada.

- 200 `{"ok": true}`.

## Planilha de saídas

Segunda finalidade da integração, em aba única de registro das saídas antecipadas. Usa o OAuth e a Sheets API descritos acima. A seleção da planilha, o modo e o mapa são próprios desta finalidade. A configuração é restrita à administração, e o envio aceita qualquer sessão ativa.

### GET /api/planilha-saidas/estado

- 200 `{"estado": {"ativa", "modo", "modoCompletoAte", "podeEnviar", "configurada"}}`. Qualquer sessão.

### GET /api/planilha-saidas e PATCH /api/planilha-saidas

Leitura e edição da configuração: `{ ativa?, envioAutomatico? }`. `envioAutomatico` liga o envio ao registrar saídas e entradas. Apenas administração. A resposta informa a conexão Google e o arquivo selecionado, sem credenciais. Ativar exige conta Google e arquivo selecionados. Campos antigos como `endpoint` são recusados.

- 200 `{"integracao": {...}}`; 400 configuração inválida ou conexão Google incompleta; 403 sem papel de administração.

### POST /api/planilha-saidas/estrutura

Lê as abas e sugere a aba única de registro, com as colunas reconhecidas.

- 200 `{ "planilha", "abas", "sugestao", "problemas" }`. Apenas administração.

### POST /api/planilha-saidas/mapa

Corpo: `{ "planilha": {...}, "abas": AbaSaidaEsquema[], "aba": string }`. Salva a aba escolhida e a assinatura.

- 200 `{"integracao": {...}}`; 400 para aba inválida, bloqueada ou ausente.

### POST /api/planilha-saidas/simular

Corpo: `{ "de", "ate", "removerLinhas"? }`. Período de até 92 dias. Devolve a prévia da aba única, o `planoHash`, as linhas novas, as correções, os candidatos à remoção e os avisos.

- 200 com resumo e listas; 400 sem estrutura ou período inválido; 429 prévias em excesso; 502 sem resposta da planilha.

### POST /api/planilha-saidas/aplicar

Mesmo corpo da simulação mais `planoHash`. Recalcula tudo, exige o mesmo hash e envia a aba. Operações destrutivas exigem o modo completo.

- 200 `{"resultado": "sucesso" | "parcial" | "falha", "contagens"?, "erro"?}`; 400 sem prévia; 409 quando os dados mudaram; 429 envios em excesso.

### POST /api/planilha-saidas/modo-completo

Corpo: `{ "frase": "EDITAR PLANILHA", "senha": string, "duracaoMinutos"?: 5 | 15 | 30 | 60 }`. Apenas administração.

- 200 `{"modo": "completo", "modoCompletoAte"}`; 400 frase, senha ou duração inválidas; 429 tentativas em excesso.

### POST /api/planilha-saidas/modo-conservador

Volta ao modo conservador. Qualquer sessão.

- 200 `{"modo": "conservador"}`.

### GET /api/planilha-saidas/copias?aba=...

Lista as cópias ocultas da aba de saídas. Apenas administração.

### POST /api/planilha-saidas/restaurar

Corpo: `{ "aba", "copia", "frase", "senha" }`. Troca a aba pela cópia, sem criar outra cópia e invalidando o esquema. Apenas administração.

- 200 `{"aba", "copia", "anterior"}`; 400 frase ou senha inválidas; 502 falha na planilha.

### POST /api/planilha-saidas/criar-aba

Corpo: `{ "nome": string, "cabecalho"?: string[] }`. Cria a aba de registro com o cabeçalho padrão das saídas. Apenas administração.

- 200 `{"aba": string}`; 400 nome inválido ou repetido; 502 falha na planilha.

### POST /api/planilha-saidas/remover-aba

Corpo: `{ "aba", "frase", "senha" }`. Exige o modo completo ativo e remove apenas aba com marcador da integração, sem criar cópia interna. Apenas administração.

- 200 `{"aba": string}`; 400 frase, senha ou modo inválidos; 502 quando a aba não foi criada pela integração.

### POST /api/planilha-saidas/desconectar

Apaga a autorização OAuth e o esquema e desliga a integração de saídas. Apenas administração. A planilha não é alterada.

- 200 `{"ok": true}`.

## Fila de envios automáticos às planilhas

Fila FIFO durável dos envios automáticos de frequência, saídas e entradas ([ADR-039](adr/039-fila-fifo-dos-envios-automaticos.md)). Os registros enfileiram sozinhos; as rotas abaixo servem à Gestão e à agenda. Nenhuma devolve nome de aluno.

| Método e rota                               | Quem                   | O que faz                                                                          |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/planilha/fila`                    | Administração          | Contagens por estado e os 50 itens mais recentes.                                  |
| `POST /api/planilha/fila/processar`         | Administração          | Processa até 20 itens agora e devolve o resumo.                                    |
| `POST /api/planilha/fila/{id}/descartar`    | Administração          | Descarta um item que aguarda a vez; outro estado responde 409.                     |
| `POST /api/planilha/fila/{id}/reenfileirar` | Administração          | Devolve ao fim da fila um item com falha ou descartado; outro estado responde 409. |
| `GET /api/planilha/fila/agenda`             | `CRON_SECRET` (Bearer) | Processa até 50 itens; cookie, mesmo de administrador, não autoriza (403).         |

O resumo do processamento traz `processados`, `concluidos`, `falhas`, `abertos` e `aguardandoAte` (próximo instante em que a fila volta a andar, quando há espera ou reserva). Descartar e reenfileirar entram na auditoria. Identificador que não é UUID responde 400, e item inexistente, 404.

## Planilha de chamada parcial

Terceiro arquivo Google, finalidade `PARCIAL`, com configuração independente. Não há envio automático e o envio à planilha não muda a confirmação manual da Seduc.

### GET /api/planilha-parcial e PATCH /api/planilha-parcial

Apenas administração. A consulta retorna `{ "integracao": { ativa, contaGoogle, googlePlanilha: { id, nome } | null, aba, preparada, podeEnviar } }`, sem credenciais. `aba` é `Chamada Parcial`. A configuração recebe corpo estrito `{ "ativa": boolean }`; ativar exige conta autorizada e arquivo escolhido.

### DELETE /api/planilha-parcial

Apenas administração. Desconecta a integração e desliga o envio; não altera o arquivo externo nem os registros locais. Retorna `{ "ok": true }`.

### GET /api/planilha-parcial/estado

Sessão da equipe. Retorna `{ podeEnviar, planilhaNome, aba }`. O envio só libera depois de conexão, ativação e preparação da aba.

### POST /api/planilha-parcial/preparar

Apenas administração. Corpo `{ "confirmacao": true }`. Cria a aba `Chamada Parcial` quando ausente, com cabeçalho padrão de nove colunas. Aba existente é conferida e não tem seus dados substituídos. Cabeçalho incompatível, fórmulas no cabeçalho ou mesclagens bloqueiam a preparação.

### POST /api/planilha-parcial/simular e /api/planilha-parcial/enviar

Sessão da equipe. Corpo estrito `{ de, ate, turmaId?, atualizarExistentes?: boolean, planoHash? }`, com datas `YYYY-MM-DD` e período inclusivo de até 92 dias. `turmaId` filtra a turma histórica. A simulação devolve a prévia e o `planoHash`; o envio exige o hash corrente e relê dados locais, valores, fórmulas e marcadores externos antes de escrever.

O plano usa os registros efetivos de `/api/frequencias-personalizadas`, com no máximo uma linha por aluno e dia. Novas linhas usam `chamada:<alunoId>:<dia>` na coluna Código, tanto para a base como para personalizações. UUIDs de personalizações enviados anteriormente são reconhecidos e preservados ao atualizar; encontrar tanto o código canônico como o UUID bloqueia a escrita. Uma linha de personalização removida sem correspondência segura exige conferência, sem acrescentar outra para o mesmo nome e dia. Por padrão, o plano acrescenta somente registros novos. `atualizarExistentes: true` autoriza explicitamente correções e confirmações já enviadas, somente nas nove colunas de linhas criadas e marcadas pela integração, com código único e sem fórmula. Divergências sem essa autorização, fórmulas ou códigos repetidos bloqueiam a escrita e exigem conferência. Linhas manuais sem código, com mesmo nome e data, são preservadas e aparecem como pendência.

Alterar dados, conexão, arquivo, estrutura ou conteúdo após a prévia exige nova simulação. Escrita enviada sem resposta exige conferência manual; não é repetida automaticamente. Remover um registro local não apaga sua linha na planilha.

O envio parcial obtém exclusão distribuída no PostgreSQL antes de remontar o plano e reler a aba. Trava ocupada responde 409; perda da conexão da trava cancela a requisição HTTP e responde 502 com orientação para conferir a planilha. A transação local não fornece atomicidade nem reversão da escrita no Google. Operações com efeito externo não são repetidas por retentativa de transação.

## Cópia de segurança

### GET /api/backup

- A exportação sem confirmação foi encerrada. Com sessão administrativa, responde 405 e orienta confirmar a senha; não devolve dados escolares. Clientes anteriores devem usar a rota abaixo.

### POST /api/backup/exportar

Corpo: `{ "senha": "senha atual do administrador" }`. A senha do ZIP não é recebida por nenhuma API.

- 200 com o documento `{ "formato": "frequenciapp", "versao": 1, "exportadoEm", "series", "turmas", "horarios", "alunos", "frequencias", "frequenciasParciais", "saidas", "entradas", "justificativas", "liberadores", "configuracoes" }`. Apenas administração, com auditoria e `Cache-Control: no-store`.
- 400 sem senha válida; 401 sem sessão; 403 sem permissão ou origem não permitida; 429 após cinco tentativas incorretas em 15 minutos, por conta e entre instâncias. Sucesso limpa o contador.

### POST /api/backup

Corpo: o documento exportado pela própria aplicação, com até 25 MB.

- 200 `{"adicionadas": number, "identicas": number, "conflitos": number}`. A mesclagem cria o que falta por identificador e nunca sobrescreve o que já existe.
- As frequências da cópia JSON podem incluir `confirmacoesSeduc`, com autoria, data e revisão por aluno. Cópias anteriores sem esse campo continuam válidas. A mesclagem preserva confirmações divergentes existentes e relata conflito, sem sobrescrever.
- `frequenciasParciais` é opcional na versão 1. Cópias anteriores continuam válidas e não removem os registros parciais atuais. Os itens preservam identidade, nomes históricos, presença, revisão, datas, autoria e confirmação da Seduc; não contêm conexões Google.
- `configuracoes.infrequenciaAtencaoPercentual` e `configuracoes.infrequenciaCriticaPercentual` são opcionais em cópias antigas; quando presentes, são inteiros de 0 a 100 e a restauração usa os valores atuais se o campo estiver ausente. `configuracoes.feriados` é opcional na versão 1 e traz datas e nomes do calendário exportado. Ausência ou lista vazia preserva o calendário vigente. A restauração mescla por data: nome igual conta como idêntico e nome divergente conta como conflito, sem sobrescrita. Novo feriado com frequência regular ou parcial no banco ou na própria cópia conta como conflito; o histórico da cópia tem prioridade sobre esse novo feriado. Frequências da cópia em feriado já cadastrado também contam como conflitos. A restauração com feriados compartilha a trava das planilhas e a transação serializável, sem restaurar os demais recursos configuráveis, exceto os dois limites de infrequência quando presentes e válidos na cópia. Feriado importado entra na cópia só como data e nome; a restauração o grava como cadastro manual e não recria, sozinha, o bloqueio da sincronização.
- A mesclagem de parciais procura por identificador ou por aluno e dia. Dados existentes nunca são substituídos; divergências e referências de aluno ou turma ausentes contam como conflitos. Contas históricas inexistentes ficam nulas, mantendo o nome da confirmação.
- Tipo (`DIA_INTEIRO`, `TURNO` ou `AULAS`), turno, aulas únicas ordenadas entre 1 e 30, calendário e confirmação coerente são validados antes da transação. Marcação verdadeira exige instante e nome; falsa exige dados de confirmação vazios.
- 400 quando o documento não está no formato do aplicativo; 403 sem papel de administração; 413 acima de 25 MB.

### POST /api/exportacoes/registro

Corpo estrito: `{ "tipo": "grade" | "relacao", "formato": "original" | "zip" }`.

- 200 `{"ok": true}` após registrar `download.preparar` com alvo do tipo `grade:zip`, conta e data. O registro indica preparação, sem comprovar que o navegador salvou o arquivo. Não recebe nomes, conteúdo nem senhas.
- Grade disponível à administração e coordenação; relação restrita à administração. Diretores não têm acesso. Exige sessão e origem válida, com 400 para corpo inválido e 403 para escopo não permitido.
- A interface registra depois de preparar o CSV ou ZIP e antes de iniciar o download. Falha no registro permite tentar novamente e não inicia download.

## Saúde

### GET /api/saude

- 200 `{"ok": true}` quando o processo responde e o banco atende.
- 503 `{"error": "..."}` quando o banco não responde. Sem sessão; serve de sonda para o healthcheck e para o CI.

## Códigos de erro

| Código | Situação                                                      |
| ------ | ------------------------------------------------------------- |
| 400    | Corpo ou parâmetro inválido.                                  |
| 401    | Sessão ausente ou expirada.                                   |
| 403    | Origem não confiável, papel insuficiente ou conta desativada. |
| 404    | Recurso inexistente.                                          |
| 409    | Conflito de duplicidade, de revisão ou de registro em uso.    |
| 413    | Corpo acima do limite aceito.                                 |
| 429    | Excesso de tentativas de entrada.                             |
| 500    | Falha interna; mensagem genérica, sem detalhes.               |
| 503    | Banco indisponível ou ocupado; convida a tentar de novo.      |

## Entradas atrasadas

As rotas exigem a capacidade `operar`; criar a aba exige `administrar`.

| Rota                                   | Corpo ou consulta                                                                                               | Resultado                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/entradas`                    | `de`, `ate`, `turmaId` opcional                                                                                 | `{ entradas: EntradaAtrasada[] }`, com turma do registro                             |
| `POST /api/entradas`                   | `{ alunoId, dia, horario: "HH:mm", momento, responsavelRegistroCodigo, motivo? , justificativa?, observacao? }` | 201; 400 para domingo; 409 para aluno desativado, desistente na data ou repetida     |
| `DELETE /api/entradas/:id`             | Identificador                                                                                                   | Remove com auditoria; preserva chamada e planilha                                    |
| `GET /api/planilha-entradas/estado`    | Nenhum                                                                                                          | Disponibilidade da conexão Google e nome da planilha, sem credenciais                |
| `POST /api/planilha-entradas/preparar` | Nenhum                                                                                                          | Cria ou organiza Entradas, realinha o formato anterior e remove somente Sheet1 vazia |
| `POST /api/planilha-entradas/simular`  | `{ de, ate, turmaId? }`                                                                                         | Prévia com hash, avisos e até 20 amostras; no máximo 92 dias                         |
| `POST /api/planilha-entradas/enviar`   | Período e `planoHash`                                                                                           | Recalcula a prévia e cria somente linhas novas; 409 se dados mudaram                 |

Novas entradas exigem momento de aula/pausa e responsável ativo do catálogo de Quem libera. A justificativa é um motivo escrito ou um tipo ativo do catálogo com observação opcional. O responsável é um retrato do nome escolhido, separado da autoria autenticada. Campos novos ausentes em cópias antigas são aceitos. Criar entrada com data de domingo responde 400 com a mensagem Domingo não tem aula. Escolha um dia de segunda a sábado; a consulta e a remoção de registros antigos de domingo continuam permitidas.

A integração usa a planilha Google selecionada para saídas. O código de cada linha combina aluno e data, permitindo reenvio sem duplicação após restauração. Falta de confirmação gera 502 com orientação para conferir a aba, sem repetir o envio automaticamente.

Preparar Entradas exige administração e origem válida. Retorna `{ criada, organizada: true, realinhada, sheet1 }`, sendo `sheet1` igual a `ausente`, `removida` ou `mantida`. A preparação conserva os registros existentes e reaplica a apresentação padrão. Uma aba Entradas no formato anterior (com Código e Liberado por) é realinhada às sete colunas de Saídas em um lote atômico, e `realinhada` indica que isso ocorreu; a coluna Código é descartada. Cabeçalho incompatível, com fórmula ou mesclagens responde 409 antes de remover Sheet1. A remoção exige leitura completa de Sheet1 sem valores, fórmulas, notas ou gráficos, nem mesclagens ou marcadores da integração, com Entradas e a aba de saídas configurada presentes e visíveis. Se Sheet1 for a aba de saídas, será mantida. A auditoria registra criação ou organização de Entradas e a situação de Sheet1.

### POST /api/planilha/limpar-copias e /api/planilha-saidas/limpar-copias

Apenas administração e origem válida. `{}` retorna `{ previa: { copias: string[], planoHash } }`, sem alterar a planilha. A confirmação envia `{ planoHash, senha, frase: "EDITAR PLANILHA" }` e retorna `{ removidas }`. Lista e conexão alteradas invalidam a prévia. A exclusão reconhece somente nomes de backup com carimbo e marcador da integração; não remove turmas ou abas manuais. A escrita não é repetida automaticamente.

## Indicadores externos (administração)

| Método e caminho                | Efeito                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| GET /api/indicadores            | Estado seguro do painel, sem token Google                                               |
| PATCH /api/indicadores          | Opções ativa, ano (2000 a 2100 ou null) e urlRelatorio (HTTPS do Looker Studio ou null) |
| POST /api/indicadores/preparar  | Cria um arquivo exclusivo se ainda não existir, e atualiza as fontes                    |
| POST /api/indicadores/atualizar | Substitui as quatro fontes agregadas                                                    |
| POST /api/indicadores/recuperar | Recupera criação pendente com endereco de arquivo marcado desta instalação              |
| GET /api/indicadores/agenda     | Atualiza fontes ativas com Authorization: Bearer CRON_SECRET, sem criar arquivo         |

As rotas administrativas exigem capacidade administrar; mutações verificam origem. Criação incerta bloqueia nova criação até recuperação. Operações concorrentes recebem 409. Erros não expõem dados pessoais ou credenciais. O último sucesso só avança após confirmação. Detalhes de fontes, atualização, compartilhamento e limites em [looker-studio.md](looker-studio.md).

## FrequenciBI

GET `/api/bi` usa somente `Authorization: Bearer fbi_...`; não aceita sessão nem chave na URL. Sem `recurso`, devolve metadados de acesso, escopo e bases permitidas, sem dado escolar. `recurso=acesso` testa a chave; demais bases: `series`, `turmas`, `alunos`, `horarios`, `justificativas`, `liberadores`, `feriados`, `chamadas`, `faltas`, `lista`, `saidas`, `entradas`, `parciais` e `contexto`.

Filtros opcionais: `inicio` e `fim` civis, `serieId`, `turmaId`, `pagina` a partir de 1 e `limite` entre 1 e 200. O escopo da chave sempre prevalece por interseção. Resposta: `recurso`, `linhas`, `pagina`, `proximaPagina`, `consultadoEm`, `escopo` e `recursos`. `proximaPagina=null` encerra a leitura. Totais da chamada usam a lista histórica e as regras existentes de presença parcial e desistência. Autoria expõe somente nome; contas e recursos operacionais ficam fora do contrato. A paginação usa ordem estável; uma atualização escolar entre páginas pode mudar o retrato, portanto a interface deduplica por identificador e atualiza sob demanda.

GET `/api/bi/chaves` lista metadados para administração. POST na mesma rota exige sessão administrativa, origem própria e senha. Corpo: `acao`, `senha` e campos da ação. `criar` exige `rotulo`, `expiraEm` ISO ou null e `escopo`; `editar` acrescenta `id`; `rotacionar` e `revogar` exigem `id`; `revogar-todas` e `limpar` não recebem identificador. O escopo permite listas de UUIDs `series` e `turmas`, datas `inicio` e `fim` e lista de `recursos`. Campos ausentes não restringem; listas vazias recusam tudo. O segredo aparece somente no retorno de criação ou rotação. A rotação preserva rótulo, escopo e validade e mantém o registro antigo revogado para auditoria de uso. Limpeza remove somente revogadas e expiradas, preservando auditoria.

Erros de leitura: 400 para consulta inválida, 401 genérico para chave indisponível, 403 para base fora do escopo e 429 para limites. Somente GET é implementado na leitura. Todas as respostas são sem cache; nenhuma mudança de dados escolares existe nesse endpoint. Limites e consequências do cache local estão na ADR-042.
