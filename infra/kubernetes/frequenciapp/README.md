# Chart Helm do FrequenciApp

Chart de referência para executar o FrequenciApp em Kubernetes. A aplicação é a mesma imagem OCI usada no Compose e na Vercel; o chart não instala PostgreSQL e não impõe um controlador de Ingress.

A decisão e o contrato portátil estão na [ADR-064](../../../docs/adr/064-auto-hospedagem-servidor.md). O guia de servidor está em [auto-hospedagem.md](../../../docs/auto-hospedagem.md) e o backup em [backup-servidor.md](../../../docs/backup-servidor.md).

## O que o chart entrega

- Deployment com initContainer de migração.
- Service ClusterIP na porta 3000.
- Ingress opcional.
- ConfigMap para variáveis não sensíveis.
- Secret opcional de desenvolvimento ou `existingSecret` para produção.
- ServiceAccount sem RBAC.
- Liveness por TCP e readiness em `/api/saude`.
- `emptyDir` para `/tmp` e `/app/.next/cache`.
- CronJob de agenda a cada cinco minutos.
- CronJobs opcionais de backup do banco e das planilhas.
- PVC opcional de backup.
- HPA e PDB opcionais.

O chart não instala PostgreSQL, cert-manager, ingress controller, External Secrets, rclone ou chaves. Esses recursos são escolhidos pela organização.

## Pré-requisitos

- Kubernetes 1.27 ou superior.
- Helm 3.14 ou superior.
- PostgreSQL 17 acessível pelo cluster.
- Imagem da aplicação publicada em um registro acessível.
- Imagem de backup publicada no mesmo registro.
- Um Ingress Controller e uma fonte de certificado, quando houver exposição externa.

## Instalação rápida

Criar o namespace:

```bash
kubectl create namespace frequenciapp
```

Criar o Secret da aplicação:

```bash
kubectl -n frequenciapp create secret generic frequenciapp-segredos \
  --from-literal=DATABASE_URL='postgresql://usuario:senha@postgres:5432/frequencia' \
  --from-literal=DIRECT_URL='postgresql://usuario:senha@postgres:5432/frequencia' \
  --from-literal=AUTH_SECRET='segredo-de-sessao-com-32-caracteres' \
  --from-literal=CRON_SECRET='segredo-da-agenda-com-32-caracteres'
```

Instalar o chart:

```bash
helm upgrade --install frequenciapp infra/kubernetes/frequenciapp \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set image.tag=1.2.3 \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=frequencia.exemplo.br \
  --set ingress.tls[0].secretName=frequenciapp-tls \
  --set ingress.tls[0].hosts[0]=frequencia.exemplo.br
```

O exemplo acima usa `--set` para leitura. Em produção, usar um arquivo de valores privado, fora do Git.

## Segredos

O modo recomendado é `existingSecret`. As chaves esperadas:

| Chave          | Obrigatória | Uso                        |
| -------------- | ----------- | -------------------------- |
| `DATABASE_URL` | sim         | Conexão de runtime         |
| `DIRECT_URL`   | não         | Migrações                  |
| `AUTH_SECRET`  | sim         | Sessões e chaves derivadas |
| `CRON_SECRET`  | sim         | Agenda e fila              |
| `GOOGLE_*`     | não         | Integração com Planilhas   |
| `PUSH_VAPID_*` | não         | Notificações               |
| `FERIADOS_*`   | não         | Calendário letivo          |
| `ADMIN_*`      | não         | Bootstrap inicial          |

O chart não recomenda `secrets.create` em produção. Quando usado, os valores ficam no arquivo de valores e no histórico do Helm.

Para External Secrets, criar o Secret com as mesmas chaves e apontar `existingSecret` para o nome.

## Ingress e TLS

O chart não escolhe o controlador. Exemplos de anotações:

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-producao
  hosts:
    - host: frequencia.exemplo.br
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: frequenciapp-tls
      hosts:
        - frequencia.exemplo.br
```

Para CA interna, criar um Secret TLS com o certificado da escola e apontar `ingress.tls[0].secretName`. O Ingress Controller precisa confiar na CA e repassar `X-Forwarded-For`, `X-Forwarded-Proto` e `X-Forwarded-Host`.

O chart não instala cert-manager.

## Migrações

O initContainer executa:

```text
node ./docker/app/migrar.mjs
```

O contêiner principal recebe `MIGRAR_NA_PARTIDA=false`. O migrador usa a trava consultiva do banco e a conferência de checksum já existente.

Recomendações:

- Primeira instalação com `replicaCount: 1`.
- Revisar migrações destrutivas no CHANGELOG.
- Fazer backup antes de atualizar.
- Não escalar réplicas durante uma migração longa.
- Em caso de falha, o Pod reinicia e repete a migração; a trava evita concorrência.

## Agenda

O CronJob de agenda chama:

- `/api/notificacoes/agenda`;
- `/api/planilha/fila/agenda`;
- `/api/indicadores/agenda`.

A URL interna padrão é `http://<release>:3000`. O segredo vem de `CRON_SECRET`.

```yaml
agenda:
  enabled: true
  schedule: "*/5 * * * *"
  timeZone: "America/Fortaleza"
  appUrl: ""
  existingSecret: ""
```

O campo `timeZone` exige Kubernetes 1.27 ou superior. O mesmo vale para `backup.database.timeZone` e `backup.spreadsheets.timeZone`.

## Backup

O backup é opcional e desativado por padrão. Quando ativado, o chart cria CronJobs separados para banco e planilhas. A imagem de backup contém PostgreSQL 17, rclone, GPG, age e Node.

### Secret de arquivos

O `backup.filesSecret` deve conter:

| Chave                | Uso                    |
| -------------------- | ---------------------- |
| `rclone.conf`        | Configuração do rclone |
| `backup-publica.asc` | Chave pública GPG      |
| `age-recipients.txt` | Destinatários age      |

Os arquivos são montados em `/etc/frequenciapp` com modo 0440 e `fsGroup` 1000. A rotina copia o `rclone.conf` para um temporário com permissão 600.

### Secret do banco

O `backup.database.existingSecret` deve conter:

| Chave                      | Uso                                           |
| -------------------------- | --------------------------------------------- |
| `BACKUP_DATABASE_URL`      | URL do banco para o dump                      |
| `BACKUP_CRIPTOGRAFIA`      | `gpg` ou `age`                                |
| `BACKUP_GPG_DESTINATARIO`  | Destinatário GPG                              |
| `BACKUP_AGE_DESTINATARIOS` | Caminho ou conteúdo conforme a rotina         |
| `BACKUP_REMOTO`            | Destino rclone                                |
| `RCLONE_CONFIG_PASS`       | Senha da configuração do rclone, quando usada |

A rotina usa `BACKUP_MODO=url`, `BACKUP_INCLUIR_AMBIENTE=false`, `BACKUP_RETER_DIAS`, `BACKUP_RETER_MINIMO` e `BACKUP_RETER_REMOTO` do values.

### Secret das planilhas

O `backup.spreadsheets.existingSecret` deve conter:

| Chave                | Uso                                           |
| -------------------- | --------------------------------------------- |
| `BACKUP_ORIGEM`      | Origem rclone                                 |
| `BACKUP_DESTINO`     | Destino rclone                                |
| `BACKUP_CHAVE`       | Chave do ZIP AES-256                          |
| `RCLONE_CONFIG_PASS` | Senha da configuração do rclone, quando usada |

### PVC

`backup.database.persistence.enabled=true` cria um PVC compartilhado para `/backups`. Sem PVC, o backup local é efêmero e o destino remoto precisa estar configurado.

```yaml
backup:
  enabled: true
  filesSecret: frequenciapp-backup-arquivos
  database:
    enabled: true
    existingSecret: frequenciapp-backup-banco
    persistence:
      enabled: true
      size: 20Gi
  spreadsheets:
    enabled: true
    existingSecret: frequenciapp-backup-planilhas
```

O backup do banco usa `BACKUP_MODO=url` e não executa `docker compose`.

## Atualização e rollback

Atualizar a imagem:

```bash
helm upgrade frequenciapp infra/kubernetes/frequenciapp \
  --namespace frequenciapp \
  --reuse-values \
  --set image.tag=1.2.4 \
  --set backupImage.tag=1.2.4
```

O initContainer aplica as migrações antes de o contêiner principal subir. O rollout usa `RollingUpdate`.

Rollback do Helm:

```bash
helm history frequenciapp --namespace frequenciapp
helm rollback frequenciapp <revisao> --namespace frequenciapp
```

O rollback do Helm não desfaz migração aplicada. Em caso de migração destrutiva, usar o runbook de restauração.

## Testes

```bash
helm lint infra/kubernetes/frequenciapp
helm template frequenciapp infra/kubernetes/frequenciapp \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set image.tag=1.2.3 >/tmp/frequenciapp.yaml
kubeconform -strict -summary /tmp/frequenciapp.yaml
helm test frequenciapp --namespace frequenciapp
```

O `helm test` verifica `/api/saude` pelo Service interno.

## Remoção

```bash
helm uninstall frequenciapp --namespace frequenciapp
kubectl delete namespace frequenciapp
```

O PVC de backup não é removido automaticamente. Conferir a política de retenção antes de apagar.

## Limitações

- O chart não instala PostgreSQL.
- O chart não instala cert-manager, ingress controller, External Secrets ou operador de backup.
- O backup local em PVC não é recuperação de desastre. Manter destino remoto.
- O CronJob de backup usa a imagem de backup, não a imagem da aplicação.
- O `values.exemplo.yaml` é ilustrativo e não contém segredos reais.
- A primeira instalação deve usar uma réplica. O aumento de réplicas depende de migração concluída e do limite de tentativas compartilhado no banco.
- O teste `helm test` depende de a imagem estar acessível ao cluster.
