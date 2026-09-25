# Operação

Rotinas do operador do FrequenciApp: contas, backup, restauração e higiene de banco.

## Administrador inicial

O primeiro usuário, com acesso root de configuração, nasce do ambiente:

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' npm run criar-admin
```

O comando é idempotente: reexecutar atualiza a senha, o nome e devolve o papel de administrador. A partir dele, o dia a dia de contas acontece na área de Gestão do próprio aplicativo.

## Contas de professor

Pela área de Gestão, recomendado, ou pelo comando idempotente de demonstração:

```bash
CONTA_EMAIL=professor@escola.br CONTA_SENHA='nova senha forte' CONTA_NOME='Ana' npm run criar-conta
```

Trocar a senha é o mesmo comando: o hash é recalculado. Pela Gestão, a troca encerra as sessões dos outros aparelhos; pelo comando, as sessões existentes continuam válidas até expirarem. Para encerrar sessões imediatamente:

```sql
delete from sessoes where usuario_id = (select id from usuarios where email = 'professor@escola.br');
```

## Conexões administrativas

Use `DIRECT_URL` para operações administrativas, migrations, backup e restauração. No Supabase, essa variável deve apontar para a Session pooler ou para uma conexão direta. A Transaction pooler em `DATABASE_URL` é para o runtime da API.

## Backup

```bash
pg_dump "$DIRECT_URL" -F c -f frequenciapp-$(date +%F).dump
```

Frequência sugerida: diária para uso letivo ativo. O arquivo é pequeno, texto puro comprimido, e cobre a totalidade dos dados.

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

## Higiene

Sessões vencidas:

```sql
delete from sessoes where expira_em < now();
```

Trilha de auditoria antiga, conforme a política de retenção da escola:

```sql
delete from auditoria where criado_em < now() - interval '1 year';
```

Frequências de períodos encerrados, quando o professor quiser arquivar em vez de manter:

```sql
delete from frequencias where dia < '2025-12-01';
```

A exclusão respeita o histórico. Confirme o período antes de executar o comando.

## Verificação de serviço

```bash
curl -s https://seu-dominio/api/saude
```

## Implantação de atualização

```bash
git pull
npm ci
DIRECT_URL=... npm run db:deploy
npm run build
# Reinicie o processo do systemd, Docker ou plataforma.
```

As migrations são aditivas por padrão. O changelog avisa quando houver passo destrutivo.
