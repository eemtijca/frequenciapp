# ADR-041: sincronização opcional de feriados

## Status

Aceita.

## Contexto

O calendário letivo já bloqueia a chamada nas datas cadastradas pela administração. Repetir os feriados nacionais, estaduais ou municipais à mão é trabalhoso e sujeito a omissão. Uma base externa publica essas datas por ano, com páginas, e exige um token. A escola não pode enviar dados de alunos para essa base, nem gravar de novo o ano inteiro por um clique acidental.

## Decisão

A sincronização é opcional e ocorre só quando a administração aciona o botão do ano selecionado:

- o servidor consulta todas as páginas; o navegador não recebe o token nem fala com a base;
- sem UF e sem código IBGE, a consulta é nacional; a UF inclui os feriados estaduais; o IBGE inclui os municipais e prevalece sobre a UF;
- pontos facultativos ficam de fora, para não bloquear um dia em que a escola pode ter aula;
- cada data nova é gravada com origem importada; feriado cadastrado à mão na mesma data conserva o nome; data com chamada salva é ignorada;
- depois que existe qualquer feriado importado, o botão fica bloqueado em todos os anos;
- desbloquear exige a senha do administrador e produz uma prova de dez minutos, ligada à conta e ao ano, sem guardar a senha;
- se não houver feriado importado, o botão permanece ativo, inclusive depois de remover os importados;
- a gravação usa a mesma trava e a mesma transação serializável do cadastro manual.

## Consequências

- Depois da primeira gravação, sincronizar outro ano também exige a senha. A prova libera somente o ano escolhido no desbloqueio.
- A cópia JSON continua levando só data e nome. A restauração grava esses feriados como cadastro manual.
- Sem `FERIADOS_API_TOKEN` o aplicativo sobe e a sincronização fica desligada.
- Uma resposta incompleta da base não grava uma lista parcial.
