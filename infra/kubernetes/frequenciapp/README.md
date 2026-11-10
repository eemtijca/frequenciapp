# Chart Helm do FrequenciApp

Chart de referência para executar o FrequenciApp em Kubernetes. A aplicação é a mesma imagem OCI usada no Compose e na Vercel; o chart não instala PostgreSQL e não impõe um controlador de Ingress.

A decisão e o contrato portátil estão na [ADR-064](../../../docs/adr/064-auto-hospedagem-servidor.md). O guia de servidor está em [auto-hospedagem.md](../../../docs/auto-hospedagem.md) e o backup em [backup-servidor.md](../../../docs/backup-servidor.md).

## O que o chart entrega

- Deployment com initContainer de migração e checksum de ConfigMap e Secret no template do Pod.
- Hook `pre-upgrade` e `pre-rollback` que exige backup do banco confirmado.
- Service ClusterIP na porta 3000.
- Ingress opcional.
- ConfigMap para variáveis não sensíveis.
- Secret opcional de desenvolvimento ou `existingSecret` para produção.
- ServiceAccount sem RBAC.
- Liveness por TCP e readiness em `/api/saude`.
- `emptyDir` para `/tmp` e `/app/.next/cache`.
- CronJob de agenda a cada cinco minutos.
- CronJobs opcionais de backup do banco e das planilhas.
- PVC próprio para o backup do banco e para o backup das planilhas.
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

O template do Pod recebe a anotação `checksum/secret`. Com `secrets.create=true`, o checksum sai do conteúdo do Secret gerenciado. Com `existingSecret`, o Helm consulta o Secret no cluster e usa o conteúdo; quando a consulta não existe, como em `helm template` offline, o checksum usa `existingSecretRevision`. Ao trocar o Secret fora do Helm sem alterar a revisão, o rollout não é disparado. Atualizar `existingSecretRevision` é a forma explícita de provocar o rollout nesse caso.

O ConfigMap também entra no checksum do Pod pela anotação `checksum/config`. Alterar qualquer variável de `config` reinicia os Pods no próximo upgrade.

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

### Confirmação de backup antes do upgrade

O `helm upgrade` e o `helm rollback` de revisões que declaram o hook executam primeiro o Job `backup-gate`. O Job usa a imagem de backup, não recebe Secret e lê o recibo `ultimo-backup.json` gravado pela rotina do banco no PVC `-backup-banco`. O gate confere:

- a existência do recibo;
- a idade do backup contra `backupGate.maxAgeHours`, com padrão de 36 horas;
- o checksum SHA-256 do arquivo confirmado;
- a verificação remota quando `backupGate.requireRemoteVerification=true`.

Sem recibo válido, o hook falha e o Helm não inicia a migração nem o rollout. A primeira instalação não executa o hook porque não há dados anteriores. O modo `backupGate.ensaioSemProtecao=true` existe apenas para ensaio explícito: ele permite o upgrade sem backup e não oferece proteção nem promessa de recuperação. O padrão é `false` e o modo é anunciado no `helm install` e no `helm upgrade`.

O gate é sempre renderizado e exige que o backup do banco esteja habilitado e que `backup.database.persistence.enabled=true`. Um backup feito fora do chart não é reconhecido.

Recomendações:

- Primeira instalação com `replicaCount: 1`.
- Revisar migrações destrutivas no CHANGELOG.
- Manter o backup do banco habilitado antes do primeiro upgrade.
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

O campo `timeZone` é sempre renderizado e exige Kubernetes 1.27 ou superior. O padrão é `America/Fortaleza` e pode ser sobrescrito em `agenda.timeZone`, `backup.database.timeZone` e `backup.spreadsheets.timeZone`.

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

### PVCs, estado e fuso

Cada rotina tem o próprio PVC `ReadWriteOnce`. O backup do banco usa `-backup-banco` em `/backups`. O backup das planilhas usa `-backup-planilhas` em `/backups`. Os dois CronJobs nunca compartilham o mesmo volume.

A atualização de uma instalação anterior cria os dois PVCs novos e não move o conteúdo do PVC antigo `-backup`. Executar o backup do banco depois do upgrade e antes do próximo upgrade com o gate.

O estado do backup do banco fica em `/backups/estado/ultimo-backup.json`, no PVC do banco. O backup das planilhas mantém o arquivo confirmado e o `.confirmado.json` em `/backups/planilhas`, no PVC das planilhas. Os PVCs carregam `helm.sh/resource-policy: keep` e não são removidos pelo `helm uninstall`.

`backup.database.persistence.enabled` e `backup.spreadsheets.persistence.enabled` são `true` por padrão. Sem o PVC do banco, o recibo não sobrevive ao Job e o gate de upgrade falha. Sem o PVC das planilhas, a cópia local não é feita e o destino remoto precisa estar configurado.

```yaml
backup:
  enabled: true
  filesSecret: frequenciapp-backup-arquivos
  database:
    enabled: true
    existingSecret: frequenciapp-backup-banco
    timeZone: America/Fortaleza
    persistence:
      enabled: true
      size: 20Gi
  spreadsheets:
    enabled: true
    existingSecret: frequenciapp-backup-planilhas
    timeZone: America/Fortaleza
    persistence:
      enabled: true
      size: 10Gi
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

O hook `backup-gate` confirma o backup antes de o initContainer aplicar as migrações. O rollout usa `RollingUpdate`. Se o gate falhar, a revisão anterior continua no ar e nenhuma migração é executada.

Rollback do Helm:

```bash
helm history frequenciapp --namespace frequenciapp
helm rollback frequenciapp <revisao> --namespace frequenciapp
```

O rollback do Helm não desfaz migração aplicada. Em caso de migração destrutiva, usar o runbook de restauração.

## Testes

O ensaio reproduzível roda em contêiner e não usa cluster:

```bash
bash tests/kubernetes/validar.sh
```

Ele executa `helm lint`, `helm template`, `kubeconform -strict` e confere o gate de backup, os checksums de ConfigMap e Secret, os dois PVCs, o estado persistente e o `timeZone`.

Validação manual:

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

Os PVCs de backup não são removidos automaticamente por causa da anotação `helm.sh/resource-policy: keep`. Conferir a política de retenção antes de apagar. Uma reinstalação que precise recriar os volumes exige a remoção manual dos PVCs antigos.

## Limitações

- O chart não instala PostgreSQL.
- O chart não instala cert-manager, ingress controller, External Secrets ou operador de backup.
- O backup local em PVC não é recuperação de desastre. Manter destino remoto e ativar `backupGate.requireRemoteVerification` quando a política exigir.
- O gate reconhece apenas o recibo do backup do banco feito pelo próprio chart. Snapshots externos do PostgreSQL não contam.
- O CronJob de backup usa a imagem de backup, não a imagem da aplicação.
- O `values.exemplo.yaml` é ilustrativo e não contém segredos reais.
- A primeira instalação deve usar uma réplica. O aumento de réplicas depende de migração concluída e do limite de tentativas compartilhado no banco.
- O teste `helm test` depende de a imagem estar acessível ao cluster.
