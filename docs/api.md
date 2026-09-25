# API

Rotas HTTP do aplicativo. Todas respondem JSON com `Cache-Control: no-store`. Mutações exigem sessão e origem confiável; consultas exigem sessão. Erros seguem o formato `{"error": "mensagem"}` com o código HTTP adequado, em português claro e sem detalhes internos (ADR-009).

Autenticação por cookie `frequenciapp_sessao` (HttpOnly, SameSite=Lax, Secure em produção). Guardas de papel: rotas de cadastro e de contas exigem `ADMIN`; frequência, histórico, grade e consultas aceitam qualquer sessão ativa.

Corpos malformados respondem 400 com leitura amigável; corpos acima de 200 kB respondem 413.

## Autenticação

### POST /api/auth/entrar

Corpo: `{ "email": string, "senha": string }`.

Respostas:

- 200 `{"usuario": {"id", "nome", "email", "papel", "ativo"}}` e cookie de sessão.
- 400 quando o corpo é inválido.
- 401 com mensagem genérica quando credenciais não conferem.
- 403 quando a conta está desativada ou a origem não é confiável.
- 429 após excesso de tentativas no mesmo IP e e-mail (15 minutos).

### POST /api/auth/sair

Encerra a sessão corrente e limpa o cookie.

- 200 `{"ok": true}`.

### GET /api/auth/sessao

- 200 `{"usuario": {...}}` ou `{"usuario": null}`.

## Conta

### POST /api/conta/senha

Troca a própria senha. Corpo: `{ "senhaAtual": string, "senhaNova": string }`. As outras sessões abertas deste usuário são encerradas.

- 200 `{"ok": true}`.
- 400 quando a senha atual não confere, a nova está fora da política (mínimo 8 caracteres, uma letra e um número) ou o corpo é inválido.

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

Frequencia: `{ dia, turmaId, revisao, atualizadoEm, atualizadoPorNome, faltas }`, com `faltas` no formato `[{ alunoId, horarios: string[] }]`.

### GET /api/frequencias?mes=YYYY-MM

Parâmetros opcionais `turmaId` e `registradoPor`.

- 200 `{"frequencias": Frequencia[]}` do mês, em ordem de dia e turma.
- 400 quando mês, turma ou autoria são inválidos.

### POST /api/frequencias

Corpo: `{ "dia": string, "turmaId": string, "faltas": [...], "revisao": number }`.

Duas formas de faltas:

- lista simples de identificadores de aluno: falta em todas as aulas do dia;
- lista de `{ "alunoId": string, "horarios": string[] }`: falta apenas nas aulas informadas.

Permissão: qualquer sessão ativa.

Semântica da `revisao`:

- `0` cria a primeira versão. Se já existe frequência do dia e turma, responde 409 com a versão vigente.
- `N` atualiza apenas se a versão vigente for `N`; a divergência responde 409 com a versão vigente.

Validações: o dia não pode ser futuro (fuso da escola); as aulas precisam pertencer à turma, estar ativas e acontecer no dia da semana; a lista de alunos é revalidada contra os alunos ativos da turma dentro da transação, aceitando quem já tinha falta registrada naquela frequência. O salvamento roda em transação serializável (ADR-007).

Respostas:

- 200 `{"frequencia": Frequencia}` com a revisão incrementada.
- 409 `{"error", "conflito": true, "frequencia": Frequencia}` em duplicata ou revisão obsoleta, inclusive quando a corrida é detectada pelo banco.
- 400 quando faltas apontam alunos de outra turma, aulas de outra turma ou de outro dia, ou a validação falha.
- 403 sem sessão; 404 turma inexistente.

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
