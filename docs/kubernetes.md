# Kubernetes

Referência para executar o FrequenciApp em Kubernetes com o chart Helm de `infra/kubernetes/frequenciapp`. O chart é opcional; a aplicação continua sendo uma imagem OCI com PostgreSQL 17 e variáveis de ambiente.

O contrato portátil está na [ADR-064](adr/064-auto-hospedagem-servidor.md). A instalação em servidor com Compose está em [auto-hospedagem.md](auto-hospedagem.md) e o backup em [backup-servidor.md](backup-servidor.md).

## O que o chart entrega

- Deployment com initContainer de migração.
- Service ClusterIP na porta 3000.
- Ingress opcional, sem impor controlador.
- ConfigMap e Secret, com `existingSecret` recomendado.
- ServiceAccount sem RBAC.
- Liveness por TCP e readiness em `/api/saude`.
- `emptyDir` para `/tmp` e `/app/.next/cache`.
- CronJob de agenda.
- CronJobs opcionais de backup do banco e das planilhas.
- PVC opcional de backup.
- HPA e PDB opcionais.

O chart não instala PostgreSQL, cert-manager, ingress controller, External Secrets ou operador de backup. Essas escolhas ficam com a organização.

## Instalação

```bash
kubectl create namespace frequenciapp
kubectl -n frequenciapp create secret generic frequenciapp-segredos \
  --from-literal=DATABASE_URL='postgresql://usuario:senha@postgres:5432/frequencia' \
  --from-literal=DIRECT_URL='postgresql://usuario:senha@postgres:5432/frequencia' \
  --from-literal=AUTH_SECRET='segredo-de-sessao-com-32-caracteres' \
  --from-literal=CRON_SECRET='segredo-da-agenda-com-32-caracteres'
helm upgrade --install frequenciapp infra/kubernetes/frequenciapp \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set image.tag=1.2.3
```

O exemplo com `--set` serve para leitura. Em produção, usar um arquivo de valores privado, fora do Git.

## Segredos

O modo recomendado é `existingSecret`. As chaves esperadas:

| Chave          | Obrigatória | Uso               |
| -------------- | ----------- | ----------------- |
| `DATABASE_URL` | sim         | Runtime           |
| `DIRECT_URL`   | não         | Migrações         |
| `AUTH_SECRET`  | sim         | Sessões           |
| `CRON_SECRET`  | sim         | Agenda e fila     |
| `GOOGLE_*`     | não         | Planilhas         |
| `PUSH_VAPID_*` | não         | Notificações      |
| `FERIADOS_*`   | não         | Calendário        |
| `ADMIN_*`      | não         | Bootstrap inicial |

Para External Secrets, criar o Secret com as mesmas chaves e apontar `existingSecret` para o nome.

## Ingress e TLS

O chart não escolhe o controlador. Exemplo com ingress-nginx e cert-manager:

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

Para CA interna, criar um Secret TLS com o certificado da escola e apontar `ingress.tls[0].secretName`. O controlador precisa repassar `X-Forwarded-For`, `X-Forwarded-Proto` e `X-Forwarded-Host`.

## Migrações

O initContainer executa `node ./docker/app/migrar.mjs`. O contêiner principal usa `MIGRAR_NA_PARTIDA=false`.

Recomendações:

- primeira instalação com uma réplica;
- backup antes de atualizar;
- revisão de migrações destrutivas no CHANGELOG;
- não escalar durante uma migração longa.

## Agenda

O CronJob chama notificações, fila e indicadores a cada cinco minutos. A URL interna padrão é `http://<release>:3000`. O segredo vem de `CRON_SECRET`.

```yaml
agenda:
  enabled: true
  schedule: "*/5 * * * *"
  timeZone: "America/Fortaleza"
```

O campo `timeZone` dos CronJobs exige Kubernetes 1.27 ou superior. Sem ele, o agendador usa o fuso do cluster. Os mesmos valores existem em `backup.database.timeZone` e `backup.spreadsheets.timeZone`.

## Backup

O backup é opcional. O chart cria CronJobs separados para banco e planilhas quando `backup.enabled=true`. `backup.retentionMinimum` preserva as cópias confirmadas e `backup.remoteRetention` habilita a limpeza remota opcional.

O `backup.filesSecret` contém `rclone.conf`, `backup-publica.asc` e `age-recipients.txt`. O `backup.database.existingSecret` contém as variáveis do banco e o `backup.spreadsheets.existingSecret` contém as variáveis das planilhas.

O detalhamento das chaves e do PVC está no [README do chart](../infra/kubernetes/frequenciapp/README.md).

## Atualização e rollback

```bash
helm upgrade frequenciapp infra/kubernetes/frequenciapp \
  --namespace frequenciapp \
  --reuse-values \
  --set image.tag=1.2.4 \
  --set backupImage.tag=1.2.4
```

Rollback do Helm:

```bash
helm history frequenciapp --namespace frequenciapp
helm rollback frequenciapp <revisao> --namespace frequenciapp
```

O rollback do Helm não desfaz migração aplicada.

## Validação

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

## Limitações

- O chart não instala PostgreSQL.
- O chart não instala cert-manager, ingress controller ou External Secrets.
- O backup local em PVC não é recuperação de desastre.
- O CronJob de backup usa a imagem de backup.
- A primeira instalação deve usar uma réplica.
- O `values.exemplo.yaml` é ilustrativo e não contém segredos reais.
