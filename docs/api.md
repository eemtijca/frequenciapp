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

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas, alunos, confirmacoesSeduc }`, com `faltas` no formato `[{ alunoId, horarios: string[] }]` e `alunos` com os ids da lista da chamada.

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

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas, alunos, confirmacoesSeduc }`, com `faltas` no formato `[{ alunoId, horarios, justificativa?, observacao? }]`; os dois últimos campos só aparecem quando há justificativa. `alunos` é a lista da chamada: na primeira gravação, a relação atual da turma; depois, a lista gravada, mais quem entrou na turma quando o dia é o corrente ([ADR-022](adr/022-lista-da-chamada-e-turma-reorganizada.md)).

Permissão: administração ou coordenação.

Semântica da `revisao`:

- `0` cria a primeira versão. Se já existe frequência do dia e turma, responde 409 com a versão vigente.
- `N` atualiza apenas se a versão vigente for `N`; a divergência responde 409 com a versão vigente.

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

Acumulado desde a primeira chamada salva até a data informada.

- 200 `{"resumo": {"primeiroDia": string | null, "diasLetivos": number, "porAluno": [{"alunoId", "faltas", "faltasJustificadas", "diasComRegistro"}]}}`.
- 400 quando a data é inválida.

Um dia com faltas justificadas conta em `faltasJustificadas`; um dia com falta simples ou parcial conta em `faltas`.

## Frequências personalizadas e parciais

As rotas exigem sessão da equipe (administração ou coordenação); diretores de turma não operam esses registros. Mutações exigem origem confiável. A Chamada Parcial não cria nem altera frequências regulares, faltas, saídas ou entradas. A confirmação manual usa o registro efetivo, seja a base diária ou a personalização.

### GET /api/frequencias-personalizadas

Filtros: `dia` ou o par inclusivo `de` e `ate`, com `turmaId` opcional. Sem datas, consulta o dia corrente da escola. Períodos aceitam até 92 dias.

- 200 `{ "registros": RegistroPersonalizado[] }`, em ordem de dia, nome e identificador. Cada item é uma `FrequenciaParcial` ou uma `FrequenciaDaChamada`.
- 400 datas inválidas, período incompleto ou invertido, uso simultâneo de dia e período ou turma inválida.

FrequenciaDaChamada: `{ tipo: "CHAMADA", id, alunoId, dia, turmaId, alunoNome, turmaNome, marca, descricao, justificativas, registradoSeduc, registradoSeducEm, registradoSeducPorNome, revisao, revisaoSeduc, criadoEm, atualizadoEm }`. O identificador é `chamada:<alunoId>:<dia>`. `revisao` pertence à chamada; `revisaoSeduc` pertence à confirmação individual. `marca` preserva P, F, FJ ou S; P tem descrição Dia inteiro. `justificativas` contém motivos únicos do catálogo, incluindo os inativos e o complemento de Outros quando preenchido; presença e falta sem justificativa retornam uma lista vazia. Saídas e entradas não inferem aulas frequentadas.

A consulta combina chamadas salvas com personalizações sem copiar nem gravar dados. A personalização prevalece por aluno e dia antes do filtro de turma. Se o aluno integrou mais de uma chamada no dia, vale a mais recentemente atualizada, com desempate pelo identificador. A lista histórica da chamada define os alunos da base, usando seus nomes e os nomes da turma na consulta; sem chamada salva nem personalização, não há registro de presença. Nomes e turma de personalizações existentes continuam históricos.

Para confirmar itens `CHAMADA`, usar `/api/frequencias/seduc` com ambas as revisões. Para personalizações, usar `/api/frequencias-parciais/{id}/seduc`.

### GET /api/frequencias-parciais

Contrato preservado: lista somente as personalizações gravadas, sem incluir a base diária.

Filtros: `dia` ou o par inclusivo `de` e `ate`, com `turmaId` histórico opcional. Sem datas, consulta o dia corrente da escola. Períodos aceitam até 92 dias.

- 200 `{ "registros": FrequenciaParcial[] }`, em ordem de dia e nome histórico.
- 400 datas inválidas, período incompleto ou invertido, uso simultâneo de dia e período ou turma inválida.

FrequenciaParcial: `{ id, alunoId, dia, turmaId, alunoNome, turmaNome, tipo, turno, aulas, observacao, registradoSeduc, registradoSeducEm, registradoSeducPorNome, revisao, criadoEm, atualizadoEm }`. Datas civis usam `YYYY-MM-DD`; instantes usam ISO 8601. Os nomes e a turma retratam a criação, mesmo depois de transferência ou renomeação. Identificadores internos de autoria não são expostos.

### POST /api/frequencias-parciais

Corpo: `{ alunoId: uuid, turmaId?: uuid, dia: "YYYY-MM-DD", tipo: "DIA_INTEIRO" | "TURNO" | "AULAS", turno?: "MANHA" | "TARDE" | null, aulas?: number[], observacao?: string | null, revisao?: number, baseChamada?: { turmaId: uuid, revisao: number } }`.

`DIA_INTEIRO` exige turno nulo ou ausente e lista de aulas vazia; `TURNO` exige Manhã ou Tarde, sem aulas; `AULAS` exige ao menos uma aula entre 1 e 30, sem turno. A aplicação elimina repetições e ordena as aulas. Observação tem até 300 caracteres; data futura é recusada. As aulas são números da presença personalizada, independentes da configuração de chamada por aula.

Ao criar a partir da base, `baseChamada` confere a revisão, a participação do aluno e a vigência da chamada usada como base e preserva sua turma, inclusive após transferência ou desativação. Se informado, `turmaId` deve corresponder à turma da base. Sem `baseChamada`, registro novo exige aluno ativo e não desistente na data; `turmaId` protege contra transferência concorrente. A personalização guarda nome do aluno e rótulo da turma no momento da criação.

- 200 `{ "registro": FrequenciaParcial }`.
- Para criar, a revisão pode ser omitida ou zero. Para corrigir um registro já existente por aluno e dia, é obrigatória a revisão vigente.
- Correção efetiva incrementa revisão e limpa a confirmação da Seduc. Repetir o mesmo conteúdo não altera a confirmação nem a revisão. Nome e turma históricos continuam preservados.
- 400 conteúdo inválido ou dia futuro; 404 aluno inexistente; 409 revisão obsoleta, base alterada ou aluno fora da lista salva, transferência concorrente ou aluno desativado/desistente em registro novo sem base.

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

### POST /api/saidas

Corpo: `{ "alunoId": string, "dia": "YYYY-MM-DD", "momento": string, "horario": "HH:MM", "justificativa"?: string, "texto"?: string, "observacao"?: string, "liberadoPorCodigo": string }`.

A justificativa é um código do catálogo ou um `texto` de até 100 caracteres. Sem código, o texto é o motivo e vale em qualquer momento. Com código, o `texto` é opcional e só vale na aula; a `observacao` vale para intervalos e almoço. `liberadoPorCodigo` é um código do catálogo de quem libera.

- 201 `{"saida": Saida}`.
- 400 para momento inválido, horário ausente ou fora de `HH:MM`, justificativa fora do catálogo, texto e tipo ausentes, aluno inválido, dia inválido, data futura ou responsável fora do catálogo.
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

Integração opcional com Google Planilhas (ver [planilha.md](planilha.md)). Na conexão OAuth, o token de atualização nunca sai do servidor; um token de acesso breve chega ao navegador somente para o Picker. Mutações exigem origem confiável; a configuração é restrita à administração, e o envio aceita qualquer sessão ativa.

### Conexão OAuth das três finalidades

- `POST /api/planilha/google/iniciar`: recebe `{ "finalidade": "FREQUENCIA" | "SAIDAS" | "PARCIAL", "reconectar"?: boolean, "mes"?: "YYYY-MM" }`, cria estado assinado e URL de autorização para a administração. Retorna `{ "url": string }` e define cookie de curta duração. Reconexão exige arquivo e autorização anteriores; o estado assinado vincula a configuração atual e o mês opcional.
- `GET /api/planilha/google/retorno`: recebe o código OAuth, confere estado e sessão, guarda o token de atualização cifrado e redireciona ao aplicativo. Na reconexão, confirma acesso ao mesmo arquivo e recusa conexão alterada durante o OAuth; atualiza apenas a credencial, preservando mapa e preferências. Retorna `google=reconectado` ou `google=erro_reconexao`, com `googleFinalidade` e o `googleMes` assinado quando informado. Nenhuma escrita na planilha é disparada pelo retorno.
- `GET /api/planilha/google/acesso?finalidade=FREQUENCIA|SAIDAS|PARCIAL`: entrega ao administrador um token de acesso breve e a configuração pública do Google Picker; nunca entrega o token de atualização. A conta já conectada à frequência pode selecionar os arquivos de saídas e chamadas parciais.
- `POST /api/planilha/google/selecionar`: recebe `{ "id": string, "finalidade": "FREQUENCIA" | "SAIDAS" | "PARCIAL" }`, confere acesso pela Sheets API e guarda a planilha da finalidade. Trocar de arquivo desliga essa integração e invalida o mapa anterior; selecionar o mesmo arquivo preserva a estrutura. A finalidade `PARCIAL` exige arquivo distinto dos arquivos das outras duas finalidades; a mesma restrição vale ao trocar o arquivo de frequência ou saídas.

Erros externos de autorização usam `{ "error": string, "codigo": string }`: `GOOGLE_RECONECTAR` (409), `GOOGLE_CONFIGURACAO` (503) ou `GOOGLE_TEMPORARIO` (502/503). A leitura de planilhas também identifica `GOOGLE_ACESSO` (403) e classifica como `GOOGLE_TEMPORARIO` o limite de leituras (429 do Google, respondido como 503), as falhas 5xx e a falta de resposta do Google (502). Assim o preparo mensal interrompe o lote uma vez, mantém as turmas restantes como não preparadas e oferece "Tentar pendentes". Respostas de leitura que antes saíam como 429 ou sem código passam a sair com esse código. O status 401 permanece reservado à sessão do aplicativo.

### GET /api/planilha/estado

- 200 `{"estado": {"ativa", "modo", "modoCompletoAte", "podeEnviar", "alteradasDepois"}}`. `alteradasDepois` conta chamadas ainda pendentes, considerando confirmação por dia e por origem. Qualquer sessão.

### GET /api/planilha e PATCH /api/planilha

Leitura e edição da configuração: `{ ativa?, envioAutomatico? }`. `envioAutomatico` liga o envio da chamada à planilha logo depois de salva (ADR-025); começa desligado. Apenas administração. A resposta informa a conexão Google e o arquivo selecionado, sem credenciais. Ativar exige conta Google e arquivo selecionados. Campos antigos como `endpoint` são recusados.

- 200 `{"integracao": {...}}`; 400 configuração inválida ou conexão Google incompleta; 403 sem papel de administração.

### POST /api/planilha/estrutura

Lê o esquema de todas as abas e sugere o mapa por turma de origem.

- 200 `{ "planilha", "abas", "sugestoes", "problemas" }`. Apenas administração.

### POST /api/planilha/mapa

Corpo: `{ "planilha": {...}, "abas": AbaEsquema[], "mapa": [{"aba", "turmaOriginalId", "mes"?, "destino"?}] }`. Salva o esquema e a assinatura.

- 200 `{"integracao": {...}}`; 400 ou 404 para aba ou turma inválida.

### POST /api/planilha/mensal

Corpo: `{ "turmaOriginalId": UUID, "mes": "AAAA-MM" }`. Exige administração e origem confiável. Prepara uma turma por requisição, com Aluno, datas de segunda a sexta, alunos e vínculos. O título usa o mês por extenso, como `1º A · Outubro`; em colisão com a mesma turma e mês de outro ano, acrescenta o ano. Em uma aba mensal existente, renomeia e remove somente colunas próprias reconhecidas de Turma atual e fim de semana, preservando linhas, demais células e destino. Repetição reutiliza o destino já ajustado. Aba manual com o mesmo nome, estrutura inesperada ou outra atualização em andamento responde 409.

- 200 `{ "aba", "mes", "turmaOriginalId", "destino", "criada", "atualizada" }`; `atualizada` é verdadeira apenas quando a aba existente foi ajustada; 400 mês inválido; 404 turma inexistente; 429 excesso de preparos.
- Depois do primeiro preparo de uma turma, cada mês exige a própria aba preparada. Mapa aceita a mesma turma em meses diferentes; o servidor confere a identificação mensal no Google e preserva meses preparados durante outra conferência.

### POST /api/planilha/simular

Corpo: `{ "turmaOriginalId"?, "todas"?: boolean, "de", "ate", "somenteAlteradas"?: boolean, "permitirInserirColunas"?, "permitirNovosAlunos"?, "substituirDivergencias"?, "limparCelulas"?, "removerLinhas"?, "removerColunas"? }`. Período de até 92 dias. Com `todas`, monta um plano por destino mapeado. Abas mensais recebem apenas segunda a sexta de seu mês e retornam `mes` e `aba`; um intervalo entre meses gera vários planos para a mesma turma. O hash inclui a aba e sua identidade. `somenteAlteradas` (padrão verdadeiro) limita cada turma aos dias sem `SUCESSO` que cubra a data e sua atualização, sem células puladas; falso usa o período inteiro, também sem fins de semana nas abas mensais. Devolve a prévia, o `planoHashGeral` e, por turma, `dias`, `semEnvio` (nada a enviar), `planoHashTurma` (o hash do envio só daquela turma) e `bloqueado` quando a estrutura impede a escrita.

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
| `POST /api/entradas`                   | `{ alunoId, dia, horario: "HH:mm", momento, responsavelRegistroCodigo, motivo? , justificativa?, observacao? }` | 201; 409 para aluno desativado, desistente na data ou entrada repetida               |
| `DELETE /api/entradas/:id`             | Identificador                                                                                                   | Remove com auditoria; preserva chamada e planilha                                    |
| `GET /api/planilha-entradas/estado`    | Nenhum                                                                                                          | Disponibilidade da conexão Google e nome da planilha, sem credenciais                |
| `POST /api/planilha-entradas/preparar` | Nenhum                                                                                                          | Cria ou organiza Entradas, realinha o formato anterior e remove somente Sheet1 vazia |
| `POST /api/planilha-entradas/simular`  | `{ de, ate, turmaId? }`                                                                                         | Prévia com hash, avisos e até 20 amostras; no máximo 92 dias                         |
| `POST /api/planilha-entradas/enviar`   | Período e `planoHash`                                                                                           | Recalcula a prévia e cria somente linhas novas; 409 se dados mudaram                 |

Novas entradas exigem momento de aula/pausa e responsável ativo do catálogo de Quem libera. A justificativa é um motivo escrito ou um tipo ativo do catálogo com observação opcional. O responsável é um retrato do nome escolhido, separado da autoria autenticada. Campos novos ausentes em cópias antigas são aceitos.

A integração usa a planilha Google selecionada para saídas. O código de cada linha combina aluno e data, permitindo reenvio sem duplicação após restauração. Falta de confirmação gera 502 com orientação para conferir a aba, sem repetir o envio automaticamente.

Preparar Entradas exige administração e origem válida. Retorna `{ criada, organizada: true, realinhada, sheet1 }`, sendo `sheet1` igual a `ausente`, `removida` ou `mantida`. A preparação conserva os registros existentes e reaplica a apresentação padrão. Uma aba Entradas no formato anterior (com Código e Liberado por) é realinhada às sete colunas de Saídas em um lote atômico, e `realinhada` indica que isso ocorreu; a coluna Código é descartada. Cabeçalho incompatível, com fórmula ou mesclagens responde 409 antes de remover Sheet1. A remoção exige leitura completa de Sheet1 sem valores, fórmulas, notas ou gráficos, nem mesclagens ou marcadores da integração, com Entradas e a aba de saídas configurada presentes e visíveis. Se Sheet1 for a aba de saídas, será mantida. A auditoria registra criação ou organização de Entradas e a situação de Sheet1.

### POST /api/planilha/limpar-copias e /api/planilha-saidas/limpar-copias

Apenas administração e origem válida. `{}` retorna `{ previa: { copias: string[], planoHash } }`, sem alterar a planilha. A confirmação envia `{ planoHash, senha, frase: "EDITAR PLANILHA" }` e retorna `{ removidas }`. Lista e conexão alteradas invalidam a prévia. A exclusão reconhece somente nomes de backup com carimbo e marcador da integração; não remove turmas ou abas manuais. A escrita não é repetida automaticamente.
