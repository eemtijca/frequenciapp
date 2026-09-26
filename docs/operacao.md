# Operação

Rotinas do operador do FrequenciApp: contas, backup, restauração e higiene de banco.

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

## Conexões administrativas

Use `DIRECT_URL` para operações administrativas, migrations, backup e restauração. No Supabase, essa variável deve apontar para a Session pooler ou para uma conexão direta. A Transaction pooler em `DATABASE_URL` é para o runtime da API.

## Backup

```bash
pg_dump "$DIRECT_URL" -F c -f frequenciapp-$(date +%F).dump
```

Frequência sugerida: diária para uso letivo ativo. O arquivo é pequeno, texto puro comprimido, e cobre a totalidade dos dados.

### Cópia JSON pela Gestão

A administração também pode baixar e importar uma cópia JSON em Gestão, Configurações, Cópia de segurança. Ela reúne séries, turmas, aulas, alunos, chamadas, saídas e configurações, serve para migração entre instalações e conferência, e a importação mescla sem sobrescrever o que já existe. A cópia JSON não substitui o `pg_dump`: para restauração completa e rotinas de operação, use o dump do banco.

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

Rotacionar o token invalida a conexão até atualizar o Script Property no Apps Script. O modo completo expira sozinho; para correções, destravar com frase, senha e duração. Cópias ocultas das abas são criadas antes de operações destrutivas e podem ser restauradas pelo card. Desconectar apaga token e esquema do banco, sem alterar a planilha.

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
