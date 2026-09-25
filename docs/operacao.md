# Operação

Rotinas do operador do Chamada: contas, backup, restauração e higiene de banco.

## Administrador inicial

O primeiro usuário, com acesso root de configuração, nasce do `.env`:

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' npm run criar-admin
```

O comando é idempotente: reexecutar atualiza a senha, o nome e devolve o papel de administrador. A partir dele, o dia a dia de contas acontece na área de Gestão do próprio aplicativo.

## Contas de professor

Pela área de Gestão (recomendado) ou pelo comando idempotente de demonstração:

```bash
CONTA_EMAIL=professor@escola.br CONTA_SENHA='nova senha forte' CONTA_NOME='Ana' npm run criar-conta
```

Trocar a senha é o mesmo comando: o hash é recalculado. Pela Gestão, a troca encerra as sessões dos outros aparelhos; pelo comando, as sessões existentes continuam válidas até expirarem. Para encerrar sessões imediatamente:

```sql
delete from sessoes where usuario_id = (select id from usuarios where email = 'professor@escola.br');
```

## Backup

```bash
pg_dump "$DATABASE_URL" -F c -f chamada-$(date +%F).dump
```

Frequência sugerida: diária para uso letivo ativo. O arquivo é pequeno (texto puro comprimido) e cobre a totalidade dos dados.

## Restauração

Em um banco vazio:

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" chamada-2026-09-25.dump
```

Conferência pós-restauração:

```sql
select count(*) as alunos from alunos;
select count(*) as chamadas, count(*) filter (where dia >= date_trunc('month', current_date)) as chamadas_mes from chamadas;
```

## Higiene

Sessões vencidas:

```sql
delete from sessoes where expira_em < now();
```

Trilha de auditoria antiga, conforme política de retenção definida com a escola:

```sql
delete from auditoria where criado_em < now() - interval '1 year';
```

Chamadas de períodos encerrados, quando o professor quiser arquivar em vez de manter:

```sql
delete from chamadas where dia < '2025-12-01';
```

A exclusão respeita o histórico: discuta com o professor o período antes de rodar.

## Verificação de serviço

```bash
curl -s https://seu-dominio/api/saude
```

## Implantação de atualização

```bash
git pull
npm ci
npx prisma migrate deploy
npm run build
# reinicie o processo (systemd, Docker ou plataforma)
```

As migrações são aditivas por padrão; o changelog avisa quando houver passo destrutivo.
