# API

Rotas HTTP do aplicativo. Todas respondem JSON com `Cache-Control: no-store`. Mutações exigem sessão e origem confiável; consultas exigem sessão. Erros seguem o formato `{"error": "mensagem"}` com o código HTTP adequado, em português claro e sem detalhes internos (ADR-009).

Autenticação por cookie `chamada_sessao` (HttpOnly, SameSite=Lax, Secure em produção). Guardas de papel: rotas de gestão exigem `ADMIN`; o restante aceita qualquer sessão ativa e filtra pelo escopo de quem pede.

Corpos malformados respondem 400 com leitura amigável; corpos acima de 200 kB respondem 413.

## Autenticação

### POST /api/auth/entrar

Corpo: `{ "email": string, "senha": string }`.

Respostas:

- 200 `{"usuario": {"id", "nome", "email", "papel", "ativo"}}` e cookie de sessão.
- 400 quando o corpo é inválido.
- 401 com mensagem genérica quando credenciais não conferem.
- 403 quando a conta está desativada ou a origem não é confiável.
- 429 após excesso de tentativas no mesmo e-mail e origem (15 minutos).

### POST /api/auth/sair

Encerra a sessão corrente e limpa o cookie.

- 200 `{"ok": true}`.

### GET /api/auth/sessao

- 200 `{"usuario": {...}}` ou `{"usuario": null}`.

## Conta

### POST /api/conta/senha

Troca a própria senha. Corpo: `{ "senhaAtual": string, "senhaNova": string }`. As outras sessões abertas deste usuário são encerradas.

- 200 `{"ok": true}`.
- 400 quando a senha atual não confere, a nova fora da política (mínimo 8 caracteres, uma letra e um número) ou o corpo é inválido.

## Séries (administração)

### GET /api/series

- 200 `{"series": Serie[]}` na ordem de exibição. Qualquer sessão.

### POST /api/series

Corpo: `{ "nome": string, "ordem": number }`.

- 201 `{"serie": Serie}`.
- 400 validação; 401 sem sessão; 403 sem papel de administrador; 409 nome repetido (sem diferenciar caixa).

### PATCH /api/series/{id}

Corpo parcial: `{ nome?, ordem? }`.

- 200 `{"serie": Serie}`; 404 inexistente; 409 nome repetido.

### DELETE /api/series/{id}

- 200 `{"ok": true}`; 409 quando a série ainda tem turmas; 404 inexistente.

## Turmas

### GET /api/turmas

- 200 `{"turmas": Turma[], "origens": Turma[]}`. Administrador recebe todas; professor recebe as atribuídas e as origens referenciadas pelos alunos delas.

Turma: `{ id, nome, serieId, serieNome, rotulo }`, com rótulo composto (por exemplo, "1º ano A").

### POST /api/turmas

Corpo: `{ "serieId": string, "nome": string }`.

- 201 `{"turma": Turma}`; 404 série inexistente; 409 turma repetida na série; 403 sem papel de administrador.

### PATCH /api/turmas/{id}

Corpo parcial: `{ nome?, serieId? }`.

- 200 `{"turma": Turma}`; 404 turma ou série inexistente; 409 rótulo repetido.

### DELETE /api/turmas/{id}

- 200 `{"ok": true}`; 409 quando ainda há alunos ou chamadas, com orientação de mover ou excluir antes.

## Alunos

### GET /api/alunos

Parâmetro opcional `turmaId`.

- 200 `{"alunos": Aluno[]}` no escopo de quem pede (todos para administrador, turmas atribuídas para professor), ordenados por turma e ordem.
- 400 quando `turmaId` não é um identificador válido.

Aluno: `{ id, nome, turmaId, turmaOriginalId, ordem, ativo }`.

### POST /api/alunos

Corpo: `{ "nome": string, "turmaId": string, "turmaOriginalId"?: string }`. A origem padrão é a própria turma; a ordem entra no fim da turma.

- 201 `{"aluno": Aluno}`; 404 turma inexistente; 403 sem papel de administrador.

### PATCH /api/alunos/{id}

Corpo parcial: `{ nome?, turmaId?, turmaOriginalId?, ordem?, ativo? }`.

- 200 `{"aluno": Aluno}`; 404 aluno ou turma inexistente.

### DELETE /api/alunos/{id}

Exclui o aluno e as faltas dele, em cascata.

- 200 `{"ok": true}`; 404 inexistente.

## Usuários (administração)

### GET /api/usuarios

- 200 `{"usuarios": UsuarioComTurmas[]}` com as turmas atribuídas.

UsuarioComTurmas: `{ id, nome, email, papel, ativo, turmas: string[] }`.

### POST /api/usuarios

Corpo: `{ "nome": string, "email": string, "senha": string, "papel"?: "ADMIN" | "PROFESSOR", "turmas"?: string[] }`.

- 201 `{"usuario": UsuarioComTurmas}`.
- 400 senha fora da política, e-mail inválido ou turmas repetidas.
- 409 e-mail já usado (sem diferenciar caixa).

### PATCH /api/usuarios/{id}

Corpo parcial: `{ nome?, email?, senha?, papel?, ativo?, turmas?: string[] }`. `turmas` substitui o conjunto completo. `ativo: false` encerra as sessões da conta.

- 200 `{"usuario": UsuarioComTurmas}`.
- 400 quando o alvo é o próprio administrador com rebaixamento ou desativação; turma inexistente na lista.
- 409 quando a escola ficaria sem administrador ativo, ou e-mail já usado.

### DELETE /api/usuarios/{id}

- 200 `{"ok": true}`.
- 400 quando o alvo é o próprio administrador.
- 409 quando a conta tem chamadas registradas (orienta desativar) ou seria o último administrador ativo.

## Chamadas

### GET /api/chamadas?dia=YYYY-MM-DD&turmaId=uuid

- 200 `{"chamada": Chamada | null}`.
- 400 quando dia ou turma são inválidos.

Chamada: `{ dia, turmaId, revisao, atualizadoEm, faltas: string[] }` com os identificadores dos alunos ausentes.

### GET /api/chamadas?mes=YYYY-MM

- 200 `{"chamadas": Chamada[]}` do mês, em ordem de dia e turma.

### POST /api/chamadas

Corpo: `{ "dia": string, "turmaId": string, "faltas": string[], "revisao": number }`.

Permissão: professor precisa da turma atribuída; administrador pode chamar qualquer turma.

Semântica da `revisao`:

- `0` cria a primeira versão. Se já existe chamada do dia e turma, responde 409 com a versão vigente.
- `N` atualiza apenas se a versão vigente for `N`; a divergência responde 409 com a versão vigente.

O salvamento roda em transação serializável; a lista de faltas é revalidada contra os alunos ativos da turma dentro da transação (ADR-007).

Respostas:

- 200 `{"chamada": Chamada}` com a revisão incrementada.
- 409 `{"error", "conflito": true, "chamada": Chamada}` em duplicata ou revisão obsoleta, inclusive quando a corrida é detectada pelo banco.
- 400 quando faltas apontam alunos de outra turma ou a validação falha.
- 403 sem atribuição da turma ou sem sessão.
- 404 turma inexistente.

## Saúde

### GET /api/saude

- 200 `{"ok": true}`. Sem sessão; serve para verificar se o processo responde.

## Códigos de erro

| Código | Situação                                                                           |
| ------ | ---------------------------------------------------------------------------------- |
| 400    | Corpo ou parâmetro inválido.                                                       |
| 401    | Sessão ausente ou expirada.                                                        |
| 403    | Origem não confiável, papel insuficiente, conta desativada ou turma não atribuída. |
| 404    | Recurso inexistente.                                                               |
| 409    | Conflito de duplicidade, de revisão ou de registro em uso.                         |
| 413    | Corpo acima do limite aceito.                                                      |
| 429    | Excesso de tentativas de entrada.                                                  |
| 500    | Falha interna; mensagem genérica, sem detalhes.                                    |
| 503    | Banco indisponível ou ocupado; convida a tentar de novo.                           |
