# Operação

Rotinas do operador do FrequenciApp: contas, diretores de turma, backup, restauração e higiene de banco.

## Administrador inicial

O primeiro usuário, com acesso root de configuração, nasce do ambiente:

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' npm run criar-admin
```

O comando é idempotente: reexecutar atualiza a senha, o nome e devolve o papel de administrador. A partir dele, o dia a dia de contas acontece na área de Gestão do próprio aplicativo.

Com Docker Compose, preencher `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` no `.env` cria o administrador na partida. Esse bootstrap é não destrutivo: se a conta já existir, ele a mantém e não regrava a senha.

## Contas da coordenação

Pela área de Gestão, recomendado, ou pelo comando idempotente de demonstração:

```bash
CONTA_EMAIL=equipe@escola.br CONTA_SENHA='nova senha forte' CONTA_NOME='Equipe' npm run criar-coordenacao
```

Trocar a senha é o mesmo comando: o hash é recalculado. Pela Gestão, a troca encerra as sessões dos outros dispositivos; pelo comando, as sessões existentes continuam válidas até expirarem. Para encerrar sessões imediatamente:

```sql
delete from sessoes where usuario_id = (select id from usuarios where email = 'equipe@escola.br');
```

## Diretores de turma

Contas só de leitura das estatísticas das turmas de origem, com o ciclo de vida da [ADR-021](adr/021-acesso-de-leitura-dos-diretores-de-turma.md). Tudo acontece na aba Diretores da Gestão; não há comando de terminal para criar diretor, e nenhuma pessoa ou turma fica no código. Os parâmetros (validade da palavra-chave, horas de sessão, tentativas, janela, o que o diretor vê e limite de risco) ficam em Gestão, Configurações, Acesso dos diretores.

### Cadastro e entrega da palavra-chave

1. Em Gestão, Diretores, cadastre o nome, o identificador (letras minúsculas, números e hífen, sem arroba, por exemplo `3a-maria`) e as turmas de origem.
2. Toque em Gerar palavra-chave. O diálogo mostra a palavra uma única vez; o servidor guarda só o hash.
3. Entregue a palavra ao próprio professor, em mãos ou por mensagem direta. Nunca em grupo, lista de e-mail, planilha, mural ou issue. Toque em Já entreguei para fechar o diálogo.
4. No primeiro acesso, o professor entra com o identificador e a palavra recebida e precisa criar uma palavra própria antes de ver qualquer dado. O selo passa de "Aguardando primeiro acesso" para "Em uso".

Palavra perdida antes do primeiro uso ou esquecida depois: gere outra. A emissão nova revoga a anterior e derruba as sessões abertas. A palavra vence pela validade dos parâmetros; cada troca feita pelo diretor renova o prazo, e a vencida só volta a funcionar com uma emissão nova.

### Resposta a vazamento

Quando a palavra de um diretor pode ter sido vista por outra pessoa:

1. Revogue na aba Diretores, com o motivo. A entrada é recusada e todas as sessões da conta caem na hora.
2. Confira o que foi consultado desde a emissão. As consultas do diretor ficam na auditoria como `diretor.consultar`, com turma e período:

```sql
select a.criado_em, a.acao, a.alvo
  from auditoria a join usuarios u on u.id = a.usuario_id
 where u.email = '3a-maria'
 order by a.criado_em desc;
```

3. Gere uma palavra nova e entregue como no cadastro.
4. Se houver sinal de tentativa por força bruta, veja as contagens da entrada. As chaves seguem os formatos `entrada:email:<login>` e `entrada:ip:<origem>:<login>`:

```sql
select chave, contagem, janela_inicio from tentativas_entrada order by janela_inicio desc limit 50;
```

Registre o incidente conforme o processo da escola; a frequência de estudantes é dado pessoal de menores (ver [lgpd.md](lgpd.md)).

### Saída da função

Revogue a palavra-chave com o motivo e retire as turmas do diretor. Vínculo iniciado no próprio dia é apagado; os demais ganham fim na véspera, para o histórico dizer quem via o quê em cada período. Desative a conta quando a pessoa deixar a escola.

### Virada do ano letivo

1. Primeiro, a estrutura: séries, turmas novas e a turma de origem dos alunos (Alunos, Definir origem, quando a 3ª série reorganiza as turmas).
2. Depois, em Diretores, revise cada conta: retire as turmas encerradas e vincule as novas. O vínculo novo vale a partir do dia em que foi criado, e o diretor não vê dados anteriores a ele.
3. Quem não continua na função: revogue a palavra-chave e retire as turmas. A lista marca "Sem turma vinculada" para quem ficou sem vínculo; uma conta assim entra, mas não vê turma alguma.
4. Confira os parâmetros de acesso, em especial as categorias visíveis e o limite de risco.

### Tentativas de entrada

As tentativas ficam na tabela `tentativas_entrada`, contadas por dispositivo e login e por login, com os limites e a janela dos parâmetros. A entrada bem-sucedida zera as chaves daquela entrada, e chaves paradas há mais de um dia saem sozinhas numa fração das tentativas. Expurgo manual e desbloqueio de um login antes do fim da janela:

```sql
delete from tentativas_entrada where janela_inicio < now() - interval '1 day';
delete from tentativas_entrada where chave like '%:3a-maria';
```

## Relações de turma

Quando a escola reorganiza turmas, como nas 3ª séries, a Chamada passa a seguir a relação atual de cada turma, e a Grade e a planilha consolidam pela turma original de cada aluno.

1. Publique a versão do aplicativo com a lista da chamada ([ADR-022](adr/022-lista-da-chamada-e-turma-reorganizada.md)) antes de mover alunos. A migração fixa quem estava em cada chamada já salva.
2. Monte um CSV com todas as turmas da série no schema abaixo. O caminho mais simples é tocar em Exportar relação, extrair o CSV se a opção ZIP protegido for usada, editar o arquivo na planilha eletrônica e salvar de novo como CSV.
3. Em Gestão, Alunos, toque em Importar relação, escolha o arquivo `.csv` ou cole o conteúdo. Linhas fora do padrão aparecem na hora, em vermelho, com o número da linha e o que corrigir.
4. Toque em Conferir e confira a prévia: o total de alunos por turma e a lista de desativados, que só pode ter quem de fato saiu. Corrija no arquivo qualquer turma desconhecida ou nome repetido.
5. Toque em Aplicar. A Chamada de cada turma passa a mostrar a relação na ordem do arquivo, com a turma original em círculo ao lado de cada nome.
6. Reimportar o mesmo arquivo, ou o que acabou de ser exportado, não muda nada.

As relações têm nomes de alunos: não as anexe em issue, pull request ou commit.

### Schema da relação de alunos

O mesmo formato vale para Importar relação e Exportar relação:

- arquivo `.csv` em UTF-8 (com ou sem BOM), uma linha por aluno;
- separador ponto e vírgula; a vírgula também é aceita na leitura;
- campos com separador, aspas ou quebra de linha entre aspas duplas, com aspas internas dobradas;
- cabeçalho obrigatório, exatamente nesta ordem:

```text
turma_atual;ordem;nome;turma_original
```

| Coluna           | Conteúdo                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| `turma_atual`    | Turma em que o aluno faz a chamada, como cadastrada (`3º ano A` ou `3º A`). |
| `ordem`          | Posição na chamada da turma: inteiro de 1 a 9999, sem repetir na turma.     |
| `nome`           | Nome do aluno, de 2 a 100 caracteres.                                       |
| `turma_original` | Turma original, pela qual a Grade e a planilha consolidam a frequência.     |

Exemplo:

```text
turma_atual;ordem;nome;turma_original
3º ano A;1;Nome do Aluno;3º ano B
3º ano A;2;Outro Aluno;3º ano A
```

A exportação leva os alunos ativos de todas as turmas, na ordem do cadastro, renumera a ordem de 1 em diante por turma e protege contra fórmula o campo que começa com `=`, `+`, `-` ou `@` (com um apóstrofo, retirado na importação). Alunos ativos das turmas presentes no arquivo que não estiverem nele são desativados na importação, sem perder o histórico.

## Conexões administrativas

Use `DIRECT_URL` para operações administrativas, migrations, backup e restauração. No Supabase, essa variável deve apontar para a Session pooler ou para uma conexão direta. A Transaction pooler em `DATABASE_URL` é para o runtime da API.

## Backup

```bash
pg_dump "$DIRECT_URL" -F c -f frequenciapp-$(date +%F).dump
```

Frequência sugerida: diária para uso letivo ativo. O arquivo é pequeno, texto puro comprimido, e cobre a totalidade dos dados.

### Cópia JSON pela Gestão

A administração também pode baixar e importar uma cópia JSON em Gestão, Configurações, Cópia de segurança. O download exige a senha atual da administração e oferece ZIP protegido por senha; extrair o JSON antes de importar. Ela reúne séries, turmas, aulas, alunos, chamadas, saídas e configurações, serve para migração entre instalações e conferência, e a importação mescla sem sobrescrever o que já existe. A cópia JSON não substitui o `pg_dump`: para restauração completa e rotinas de operação, use o dump do banco. Cuidados em [downloads.md](downloads.md).

## Restauração

Em um banco vazio:

```bash
pg_restore --clean --if-exists -d "$DIRECT_URL" frequenciapp-2026-09-25.dump
```

Conferência posterior:

```sql
select count(*) as alunos from alunos;
select count(*) as frequencias,
       count(*) filter (where dia >= date_trunc('month', current_date)) as frequencias_mes
  from frequencias;
```

## Sincronização com a planilha

Quando a integração com o Google Planilhas está ativa, a rotina é:

1. conferir a estrutura em Gestão, Configurações, Google Planilhas, se o cabeçalho ou as abas mudaram;
2. enviar pela Grade, com a turma de origem e o período selecionados, ou pelo card da Gestão para o mês de todas as turmas;
3. revisar a prévia e confirmar; o aplicativo relata células preenchidas, puladas e divergências.

A conexão usa Entrar com Google e seleção de arquivo. Autorizações revogadas exigem nova conexão da conta. O modo completo expira sozinho; para correções, destravar com frase, senha e duração. A integração não cria abas de backup. Cópias internas antigas podem ser listadas e removidas com prévia e confirmação, sem atingir abas das turmas. Desconectar apaga a autorização cifrada e o esquema do banco, sem alterar a planilha.

## Higiene

Sessões vencidas:

```sql
delete from sessoes where expira_em < now();
```

Trilha de auditoria antiga, conforme a política de retenção da escola:

```sql
delete from auditoria where criado_em < now() - interval '1 year';
```

Frequências de períodos encerrados, quando a escola quiser arquivar em vez de manter:

```sql
delete from frequencias where dia < '2025-12-01';
```

A exclusão respeita o histórico. Confirme o período antes de executar o comando.

## Verificação de serviço

```bash
curl -s https://seu-dominio/api/saude
```

A rota consulta o banco: responde `{"ok":true}` com a conexão saudável e 503 quando o banco não responde. O serviço `app` do Compose usa essa rota como healthcheck, então `docker compose ps` mostra `healthy` quando aplicação e banco estão prontos.

## Implantação de atualização

```bash
git pull
npm ci
DIRECT_URL=... npm run db:deploy
npm run build
# Reinicie o processo do systemd, Docker ou plataforma.
```

As migrations são aditivas por padrão. O changelog avisa quando houver passo destrutivo.
