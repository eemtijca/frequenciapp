# API

Rotas HTTP do aplicativo. Todas respondem JSON com `Cache-Control: no-store`. Mutações exigem sessão e origem confiável; consultas exigem sessão. Erros seguem o formato `{"error": "mensagem"}` com o código HTTP adequado, em português claro e sem detalhes internos (ADR-009).

Autenticação por cookie `frequenciapp_sessao` (HttpOnly, SameSite=Lax, Secure em produção, salvo com `PERMITIR_HTTP=true`). Guardas por capacidade ([ADR-021](adr/021-acesso-de-leitura-dos-diretores-de-turma.md)): rotas de cadastro, de contas, de configurações de recursos, dos catálogos, das integrações e de cópia de segurança exigem `administrar` (papel `ADMIN`); chamada, relatórios, saídas e consultas exigem `operar` (`ADMIN` e `COORDENACAO`); a troca da própria senha exige `alterarPropriaSenha`; as estatísticas do diretor de turma exigem `verEstatisticasDasTurmas` (papel `DIRETOR_TURMA`). Sem sessão, 401; com sessão sem a capacidade, 403.

Corpos malformados respondem 400 com leitura amigável; corpos acima de 200 kB respondem 413.

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

Corpo: `{ "serieId": string, "nome": string }`. Apenas administração. A turma nasce com a aula padrão (00:00 às 23:59, todos os dias).

- 201 `{"turma": Turma}`; 404 série inexistente; 409 turma repetida na série.

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

Horario: `{ id, turmaId, ordem, inicio, fim, diasSemana, ativo }`, com `inicio` e `fim` em `HH:MM` e `diasSemana` em ISO (1 é segunda, 7 é domingo).

### POST /api/horarios

Corpo: `{ "turmaId": string, "ordem": number, "inicio": "HH:MM", "fim": "HH:MM", "diasSemana": number[], "ativo"?: boolean }`.

- 201 `{"horario": Horario}`.
- 400 horário inválido, fim não posterior ao início, dias vazios ou repetidos.
- 404 turma inexistente; 409 ordem repetida na turma.

### PATCH /api/horarios/{id}

Corpo parcial: `{ ordem?, inicio?, fim?, diasSemana?, ativo? }`.

- 200 `{"horario": Horario}`; 404 inexistente; 409 ordem repetida.

### DELETE /api/horarios/{id}

- 200 `{"ok": true}`; 409 quando a aula já tem faltas registradas (o caminho é desativar); 404 inexistente.

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

Corpo parcial: `{ nome?, email?, senha?, papel?, ativo? }`. `ativo: false` encerra as sessões da conta.

- 200 `{"usuario": Usuario}`.
- 400 quando o alvo é a própria conta com rebaixamento ou desativação.
- 409 quando a escola ficaria sem administrador ativo, ou o e-mail já é usado.

### DELETE /api/usuarios/{id}

Exclui a conta. As frequências da escola são preservadas e a autoria fica anulável.

- 200 `{"ok": true}`.
- 400 quando o alvo é a própria conta.
- 409 quando a conta seria o último administrador ativo.

## Frequências

### GET /api/frequencias?dia=YYYY-MM-DD&turmaId=uuid

- 200 `{"frequencia": Frequencia | null}`.
- 400 quando dia ou turma são inválidos.

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas, alunos }`, com `faltas` no formato `[{ alunoId, horarios: string[] }]` e `alunos` com os ids da lista da chamada.

### GET /api/frequencias?mes=YYYY-MM

Parâmetros opcionais `turmaId` e `registradoPor`.

- 200 `{"frequencias": Frequencia[]}` do mês, em ordem de dia e turma.
- 400 quando mês, turma ou autoria são inválidos.

### GET /api/frequencias?dia=YYYY-MM-DD

Sem `turmaId`, devolve o dia inteiro para o Painel.

- 200 `{"frequencias": Frequencia[]}` com todas as turmas do dia.
- 400 quando o dia é inválido.

### GET /api/frequencias?de=YYYY-MM-DD&ate=YYYY-MM-DD

Período inclusivo, com `turmaId` opcional.

- 200 `{"frequencias": Frequencia[]}` do período, em ordem de dia e turma.
- 400 quando as datas são inválidas, a final é anterior à inicial ou o período passa de 366 dias.

### POST /api/frequencias

Corpo: `{ "dia": string, "turmaId": string, "faltas": [...], "revisao": number }`.

Três formas de faltas:

- lista simples de identificadores de aluno: falta em todas as aulas do dia;
- lista de `{ "alunoId": string, "horarios": string[] }`: falta apenas nas aulas informadas;
- lista de `{ "alunoId": string, "justificativa"?: string, "observacao"?: string, "horarios"?: string[] }`: falta com justificativa do catálogo. Sem `horarios`, cobre todas as aulas do dia. A observação é aceita para qualquer código e faz sentido no código `O` (Outros).

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas, alunos }`, com `faltas` no formato `[{ alunoId, horarios, justificativa?, observacao? }]`; os dois últimos campos só aparecem quando há justificativa. `alunos` é a lista da chamada: na primeira gravação, a relação atual da turma; depois, a lista gravada, mais quem entrou na turma quando o dia é o corrente ([ADR-022](adr/022-lista-da-chamada-e-turma-reorganizada.md)).

Permissão: qualquer sessão ativa.

Semântica da `revisao`:

- `0` cria a primeira versão. Se já existe frequência do dia e turma, responde 409 com a versão vigente.
- `N` atualiza apenas se a versão vigente for `N`; a divergência responde 409 com a versão vigente.

Validações: o dia não pode ser futuro (fuso da escola); as aulas precisam pertencer à turma, estar ativas e acontecer no dia da semana; a lista de alunos é revalidada contra os alunos ativos da turma dentro da transação, aceitando quem já tinha falta registrada naquela frequência. O salvamento roda em transação serializável (ADR-007).

Respostas:

- 200 `{"frequencia": Frequencia}` com a revisão incrementada.
- 409 `{"error", "conflito": true, "frequencia": Frequencia}` em duplicata ou revisão obsoleta, inclusive quando a corrida é detectada pelo banco.
- 400 quando faltas apontam alunos de outra turma, aulas de outra turma ou de outro dia, quando a justificativa não pertence ao catálogo, ou quando outra validação falha.
- 403 sem sessão; 404 turma inexistente.

### GET /api/frequencias/resumo?ate=YYYY-MM-DD

Acumulado desde a primeira chamada salva até a data informada.

- 200 `{"resumo": {"primeiroDia": string | null, "diasLetivos": number, "porAluno": [{"alunoId", "faltas", "faltasJustificadas", "diasComRegistro"}]}}`.
- 400 quando a data é inválida.

Um dia com faltas justificadas conta em `faltasJustificadas`; um dia com falta simples ou parcial conta em `faltas`.

## Saídas antecipadas

### GET /api/saidas

Filtros: `dia`, `de` e `ate` (período inclusivo), `alunoId` e `turmaId` (turma atual do aluno). É preciso informar ao menos um.

- 200 `{"saidas": Saida[]}` em ordem de dia e registro.
- 400 quando algum parâmetro é inválido ou o período está invertido.

Saida: `{ id, alunoId, dia, momento, horario, justificativa, observacao, texto, liberadoPorId, liberadoPorCodigo, liberadoPorNome, criadoEm }`. `justificativa` é nula quando o motivo foi escrito. `liberadoPorNome` resolve o rótulo atual do catálogo de quem libera ou, nos registros antigos, o nome da conta.

### POST /api/saidas

Corpo: `{ "alunoId": string, "dia": "YYYY-MM-DD", "momento": string, "horario": "HH:MM", "justificativa"?: string, "texto"?: string, "observacao"?: string, "liberadoPorCodigo": string }`.

A justificativa é um código do catálogo ou um `texto` de até 100 caracteres. Sem código, o texto é o motivo e vale em qualquer momento. Com código, o `texto` é opcional e só vale na aula; a `observacao` vale para intervalos e almoço. `liberadoPorCodigo` é um código do catálogo de quem libera.

- 201 `{"saida": Saida}`.
- 400 para momento inválido, horário ausente ou fora de `HH:MM`, justificativa fora do catálogo, texto e tipo ausentes, aluno inválido, dia inválido, data futura ou responsável fora do catálogo.
- 404 aluno inexistente; 409 quando o aluno desativado ou já tem saída no dia.

### DELETE /api/saidas/{id}

Remove a saída para correção.

- 200 `{"ok": true}`; 404 inexistente.

## Configurações

### GET /api/configuracoes

- 200 `{"configuracoes": {"frequenciaPorAula": boolean, "saidaAntecipada": boolean, "origemNaChamada": boolean, "origemNaChamadaSerieIds": string[], "origemNaChamadaTurmaIds": string[]}}`. Qualquer sessão.

### PATCH /api/configuracoes

Corpo parcial: `{ frequenciaPorAula?, saidaAntecipada?, origemNaChamada?, origemNaChamadaSerieIds?, origemNaChamadaTurmaIds? }`. Apenas administração, com auditoria.

As listas aceitam até 500 UUIDs existentes cada, sem duplicatas na resposta. A seleção é a união das séries completas com as turmas avulsas. Lista vazia não habilita nenhuma turma; alterar somente `origemNaChamada` preserva as seleções. Desligar controla apenas a exibição, sem modificar alunos, chamadas ou planilhas. Seleção inexistente responde 400 e não altera a configuração.

- 200 `{"configuracoes": Configuracoes}`; 400 corpo inválido; 403 sem papel de administração.

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

Integração opcional com Google Planilhas (ver [planilha.md](planilha.md)). Na conexão OAuth, o token de atualização nunca sai do servidor; um token de acesso breve chega ao navegador somente para o Picker. Na conexão legada, o endpoint e o token ficam no servidor. Mutações exigem origem confiável; a configuração é restrita à administração, e o envio aceita qualquer sessão ativa.

### Conexão OAuth da frequência e das saídas

- `POST /api/planilha/google/iniciar`: recebe `{ "finalidade": "FREQUENCIA" | "SAIDAS" }`, cria estado assinado e URL de autorização para a administração. Retorna `{ "url": string }` e define cookie de curta duração.
- `GET /api/planilha/google/retorno`: recebe o código OAuth, confere estado e sessão, guarda o token de atualização cifrado e redireciona ao aplicativo.
- `GET /api/planilha/google/acesso?finalidade=FREQUENCIA|SAIDAS`: entrega ao administrador um token de acesso breve e a configuração pública do Google Picker; nunca entrega o token de atualização. A conta já conectada à frequência pode selecionar a planilha de saídas.
- `POST /api/planilha/google/selecionar`: recebe `{ "id": string, "finalidade": "FREQUENCIA" | "SAIDAS" }`, confere acesso pela Sheets API, guarda a planilha da finalidade, desliga essa integração e invalida o mapa anterior.

### GET /api/planilha/estado

- 200 `{"estado": {"ativa", "modo", "modoCompletoAte", "podeEnviar", "alteradasDepois"}}`. Qualquer sessão.

### GET /api/planilha e PATCH /api/planilha

Leitura e edição da configuração: `{ ativa?, endpoint?, envioAutomatico? }`. `envioAutomatico` liga o envio da chamada à planilha logo depois de salva (ADR-025); começa desligado. Apenas administração. O token volta mascarado.

- 200 `{"integracao": {...}}`; 400 endereço fora do padrão; 403 sem papel de administração.

### POST /api/planilha/token

Corpo: `{ "acao": "gerar" | "revelar", "senha": string }`. Apenas administração, com a senha conferida e limite de tentativas.

- 200 `{"token": string}`; 400 senha incorreta; 429 tentativas em excesso.

### POST /api/planilha/testar

Na conexão legada, corpo `{ "endpoint"?: string }`. Faz `ping` no Web App, guarda a versão do script e avisa quando o fuso do script difere de `TZ_APP` ou quando a versão publicada está atrasada.

- 200 `{"ping": { ..., "avisos": string[] }}`; 400 endereço ou token ausente; 502 sem resposta.

### POST /api/planilha/estrutura

Lê o esquema de todas as abas e sugere o mapa por turma de origem.

- 200 `{ "planilha", "abas", "sugestoes", "problemas" }`. Apenas administração.

### POST /api/planilha/mapa

Corpo: `{ "planilha": {...}, "abas": AbaEsquema[], "mapa": [{"aba", "turmaOriginalId"}] }`. Salva o esquema e a assinatura.

- 200 `{"integracao": {...}}`; 400 ou 404 para aba ou turma inválida.

### POST /api/planilha/simular

Corpo: `{ "turmaOriginalId"?, "todas"?: boolean, "de", "ate", "somenteAlteradas"?: boolean, "permitirInserirColunas"?, "permitirNovosAlunos"?, "substituirDivergencias"?, "limparCelulas"?, "removerLinhas"?, "removerColunas"? }`. Período de até 92 dias. Com `todas`, monta um plano por turma mapeada. `somenteAlteradas` (padrão verdadeiro) limita cada turma aos dias com chamada criada ou alterada desde o último envio `SUCESSO` dela; falso usa o período inteiro. Devolve a prévia, o `planoHashGeral` e, por turma, `dias`, `semEnvio` (nada a enviar), `planoHashTurma` (o hash do envio só daquela turma) e `bloqueado` quando a estrutura impede a escrita.

- 200 com planos e resumos; 400 sem estrutura ou período inválido; 429 prévias em excesso; 502 sem resposta da planilha.

### POST /api/planilha/aplicar

Uma turma por requisição: `turmaOriginalId` obrigatório, `todas` recusado. Mesmo corpo da simulação mais `planoHashGeral`, que é o `planoHashTurma` da prévia. Recalcula o plano, exige o mesmo hash e envia. Operações destrutivas exigem o modo completo. O registro nasce `PARCIAL` antes da chamada ao Google e vira `SUCESSO` com a resposta; o envio nunca é repetido automaticamente. Depois de criar coluna ou linha, a estrutura da aba é relida e salva.

- 200 `{"resultados", "resumo"}`; cada resultado é `sucesso`, `parcial` (sem confirmação: timeout ou queda depois de enviar, com a mensagem para conferir a aba), `falha` (recusa do script) ou `sem_envio`.
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

Somente administração, com origem válida. Corpo `{ aba }` retorna `{ previa }`, com linha do cabeçalho, assinatura, colunas reconhecidas e suas larguras, além de `planoHash`. Essa etapa apenas lê a planilha. A confirmação envia `{ aba, planoHash }` e retorna `{ organizada: true, aba }`, depois de reler e conferir a prévia. Alteração do arquivo, da conexão ou do cabeçalho responde 409 e exige nova prévia. A apresentação é registrada em `planilha.organizar`; valores, fórmulas, formatos numéricos e rótulos não mudam. Não há repetição automática da escrita. A integração legada exige Apps Script 5; a aba Entradas usa somente a conexão Google de saídas e seu cabeçalho padrão.

Somente em `/api/planilha/organizar`, `{ aba, ajustarCabecalho: true, anoReferencia?: number }` retorna uma prévia com `ajusteCabecalho`: quantidade de linhas introdutórias reconhecidas a remover e datas a corrigir para `dd/mm/aaaa`. A confirmação repete esses campos e inclui `planoHash`. O ano deve estar entre 2000 e 2100; datas com ano explícito orientam os rótulos curtos próximos. A operação não cria cópias internas, recusa fórmulas nas células afetadas ou introdução não reconhecida, preserva os dados da tabela e atualiza o esquema mantendo o mapa. O provedor legado exige Apps Script 7. Mesclagens somente na introdução podem ser removidas; mesclagens na tabela continuam bloqueadas.

A organização coletiva reutiliza `/api/planilha/organizar` com `{ aba, emLote: true }`, além dos campos de correção quando necessários. Só aceita abas do mapa salvo de frequência. O cliente confere todas as abas e confirma cada plano em sequência, mantendo as requisições curtas. A assinatura coletiva vincula cada prévia ao arquivo, às credenciais e ao mapa; atualizações do cache de esquema causadas por outra aba não a invalidam. Mudanças no cabeçalho continuam exigindo nova prévia. Abas com falha na prévia não recebem confirmação; falhas de escrita não provocam repetição automática.

### POST /api/planilha/criar-aba

Corpo: `{ "nome": string, "cabecalho"?: string[] }`. Cria uma aba nova com cabeçalho mínimo e marcador da integração. Apenas administração.

- 200 `{"aba": string}`; 400 nome inválido ou repetido; 502 falha na planilha.

### POST /api/planilha/remover-aba

Corpo: `{ "aba", "frase", "senha" }`. Exige o modo completo ativo e remove apenas aba com marcador da integração, sem criar cópia interna. Apenas administração.

- 200 `{"aba": string}`; 400 frase, senha ou modo inválidos; 502 quando a aba não foi criada pela integração.

### POST /api/planilha/desconectar

Apaga token e esquema e desliga a integração. Apenas administração. A planilha não é alterada.

- 200 `{"ok": true}`.

## Planilha de saídas

Segunda finalidade da integração, em aba única de registro das saídas antecipadas. Pode usar o OAuth e a Sheets API descritos acima ou a conexão legada por Apps Script. A seleção da planilha, o modo e o mapa são próprios desta finalidade. A configuração é restrita à administração, e o envio aceita qualquer sessão ativa.

### GET /api/planilha-saidas/estado

- 200 `{"estado": {"ativa", "modo", "modoCompletoAte", "podeEnviar", "configurada"}}`. Qualquer sessão.

### GET /api/planilha-saidas e PATCH /api/planilha-saidas

Leitura e edição da configuração: `{ ativa?, endpoint? }`. Apenas administração. O token volta mascarado.

- 200 `{"integracao": {...}}`; 400 endereço fora do padrão; 403 sem papel de administração.

### POST /api/planilha-saidas/token

Corpo: `{ "acao": "gerar" | "revelar", "senha": string }`. Apenas administração, com a senha conferida e limite de tentativas.

- 200 `{"token": string}`; 400 senha incorreta; 429 tentativas em excesso.

### POST /api/planilha-saidas/testar

Corpo: `{ "endpoint"?: string }`. Faz `ping` no Web App, guarda a versão do script e avisa quando o fuso ou a versão divergem.

- 200 `{"ping": { ..., "avisos": string[] }}`; 400 endereço ou token ausente; 502 sem resposta.

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

Apaga token e esquema e desliga a integração de saídas. Apenas administração. A planilha não é alterada.

- 200 `{"ok": true}`.

## Cópia de segurança

### GET /api/backup

- A exportação sem confirmação foi encerrada. Com sessão administrativa, responde 405 e orienta confirmar a senha; não devolve dados escolares. Clientes anteriores devem usar a rota abaixo.

### POST /api/backup/exportar

Corpo: `{ "senha": "senha atual do administrador" }`. A senha do ZIP não é recebida por nenhuma API.

- 200 com o documento `{ "formato": "frequenciapp", "versao": 1, "exportadoEm", "series", "turmas", "horarios", "alunos", "frequencias", "saidas", "entradas", "justificativas", "liberadores", "configuracoes" }`. Apenas administração, com auditoria e `Cache-Control: no-store`.
- 400 sem senha válida; 401 sem sessão; 403 sem permissão ou origem não permitida; 429 após cinco tentativas incorretas em 15 minutos, por conta e entre instâncias. Sucesso limpa o contador.

### POST /api/backup

Corpo: o documento exportado pela própria aplicação, com até 25 MB.

- 200 `{"adicionadas": number, "identicas": number, "conflitos": number}`. A mesclagem cria o que falta por identificador e nunca sobrescreve o que já existe.
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

| Rota                                   | Corpo ou consulta                                                                                               | Resultado                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/entradas`                    | `de`, `ate`, `turmaId` opcional                                                                                 | `{ entradas: EntradaAtrasada[] }`, com turma do registro               |
| `POST /api/entradas`                   | `{ alunoId, dia, horario: "HH:mm", momento, responsavelRegistroCodigo, motivo? , justificativa?, observacao? }` | 201; 409 para aluno desativado, desistente na data ou entrada repetida |
| `DELETE /api/entradas/:id`             | Identificador                                                                                                   | Remove com auditoria; preserva chamada e planilha                      |
| `GET /api/planilha-entradas/estado`    | Nenhum                                                                                                          | Disponibilidade da conexão Google e nome da planilha, sem credenciais  |
| `POST /api/planilha-entradas/preparar` | Nenhum                                                                                                          | Cria a aba Entradas se ausente, sem alterar aba existente              |
| `POST /api/planilha-entradas/simular`  | `{ de, ate, turmaId? }`                                                                                         | Prévia com hash, avisos e até 20 amostras; no máximo 92 dias           |
| `POST /api/planilha-entradas/enviar`   | Período e `planoHash`                                                                                           | Recalcula a prévia e cria somente linhas novas; 409 se dados mudaram   |

Novas entradas exigem momento de aula/pausa e responsável ativo do catálogo de Quem libera. A justificativa é um motivo escrito ou um tipo ativo do catálogo com observação opcional. O responsável é um retrato do nome escolhido, separado da autoria autenticada. Campos novos ausentes em cópias antigas são aceitos.

A integração usa a planilha Google selecionada para saídas; Apps Script não atende entradas. O código de cada linha combina aluno e data, permitindo reenvio sem duplicação após restauração. Falta de confirmação gera 502 com orientação para conferir a aba, sem repetir o envio automaticamente.

### POST /api/planilha/limpar-copias e /api/planilha-saidas/limpar-copias

Apenas administração e origem válida. `{}` retorna `{ previa: { copias: string[], planoHash } }`, sem alterar a planilha. A confirmação envia `{ planoHash, senha, frase: "EDITAR PLANILHA" }` e retorna `{ removidas }`. Lista e conexão alteradas invalidam a prévia. A exclusão reconhece somente nomes de backup com carimbo e marcador da integração; não remove turmas ou abas manuais. A escrita não é repetida automaticamente. No provedor legado, exige Apps Script 7.
