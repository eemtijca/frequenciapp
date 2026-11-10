# Kubernetes

Referência para executar o FrequenciApp em Kubernetes com o chart Helm de `infra/kubernetes/frequenciapp`. O chart é opcional; a aplicação continua sendo uma imagem OCI com PostgreSQL 17 e variáveis de ambiente.

O contrato portátil está na [ADR-064](adr/064-auto-hospedagem-servidor.md). A instalação em servidor com Compose está em [auto-hospedagem.md](auto-hospedagem.md) e o backup em [backup-servidor.md](backup-servidor.md).

## O que o chart entrega

- Deployment com initContainer de migração e checksum de ConfigMap e Secret no template do Pod.
- Hook `pre-upgrade` e `pre-rollback` que exige backup do banco confirmado.
- Service ClusterIP na porta 3000.
- Ingress opcional, sem impor controlador.
- ConfigMap e Secret, com `existingSecret` recomendado.
- ServiceAccount sem RBAC.
- Liveness por TCP e readiness em `/api/saude`.
- `emptyDir` para `/tmp` e `/app/.next/cache`.
- CronJob de agenda.
- CronJobs opcionais de backup do banco e das planilhas.
- PVC próprio para o backup do banco e para o backup das planilhas.
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

Alterações de ConfigMap e Secret entram no template do Pod pelas anotações `checksum/config` e `checksum/secret`, então o rollout acontece no upgrade seguinte. Com `secrets.create=true`, o checksum usa o conteúdo do Secret gerenciado. Com `existingSecret`, o Helm consulta o Secret no cluster; quando não há cluster, como em `helm template` offline, o checksum usa `existingSecretRevision`. Trocar o Secret fora do Helm exige atualizar essa revisão para disparar o rollout.

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

Antes do initContainer, o `helm upgrade` e o `helm rollback` de revisões que declaram o hook executam `backup-gate`. O Job usa a imagem de backup, não recebe Secret e lê o recibo `ultimo-backup.json` no PVC do backup do banco. O gate confere a idade do backup, o checksum SHA-256 do arquivo e, quando configurado, a verificação remota. Sem recibo válido, o Helm falha antes da migração e da troca de Pods.

O gate é sempre renderizado e usa `backupGate.maxAgeHours=36` por padrão. A primeira instalação não executa o hook. O modo `backupGate.ensaioSemProtecao=true` permite o upgrade sem backup confirmado apenas para ensaio e não oferece proteção nem promessa de recuperação; ele é explicitamente desaconselhado fora de teste.

Recomendações:

- primeira instalação com uma réplica;
- manter o backup do banco e o PVC habilitados antes do primeiro upgrade;
- revisão de migrações destrutivas no CHANGELOG;
- não escalar durante uma migração longa.

## Agenda

O CronJob chama notificações, fila e indicadores a cada cinco minutos. A URL interna padrão é `http://<release>:3000`. O segredo vem de `CRON_SECRET`.

```yaml
agenda:
  enabled: true
  notifications: true
  spreadsheets: true
  indicators: true
  schedule: "*/5 * * * *"
  timeZone: "America/Fortaleza"
  timeoutSeconds: 300
  appUrl: ""
```

Cada função é uma chamada independente: desligar uma não impede as demais e uma falha não interrompe as seguintes. `timeoutSeconds` vale para cada requisição e aceita inteiros de 1 a 2147483. A URL interna padrão é `http://<release>:3000` e pode ser trocada por `appUrl`. Manter apenas uma agenda de indicadores entre servidor, Kubernetes e Actions, porque execuções concorrentes repetem trabalho.

O campo `timeZone` dos CronJobs exige Kubernetes 1.27 ou superior e é sempre renderizado com `America/Fortaleza` por padrão. Os mesmos valores existem em `backup.database.timeZone` e `backup.spreadsheets.timeZone` e podem ser sobrescritos.

## Backup

O backup é opcional na instalação, mas o gate de upgrade exige um backup do banco confirmado. O chart cria CronJobs separados para banco e planilhas quando `backup.enabled=true`. `backup.retentionMinimum` preserva as cópias confirmadas e `backup.remoteRetention` habilita a limpeza remota opcional.

Cada rotina tem o próprio PVC `ReadWriteOnce`: `-backup-banco` para o dump e o recibo, `-backup-planilhas` para os arquivos confirmados. O estado do banco fica em `/backups/estado/ultimo-backup.json`; o backup das planilhas fica em `/backups/planilhas`. O PVC do banco é obrigatório para o gate de upgrade. Sem o PVC das planilhas, a cópia local não é feita e o destino remoto precisa estar configurado. Os PVCs usam `helm.sh/resource-policy: keep` e não são removidos pelo `helm uninstall`.

O backup do banco exige PVC ou `backup.database.remote.enabled=true`. Com `backup.database.local=true`, o PVC é obrigatório. No modo somente remoto, definir `local=false` e `persistence.enabled=false`; o chart injeta `BACKUP_EXIGIR_REMOTO=true` e a rotina recusa remoto vazio ou verificação desligada. Como o recibo fica no PVC, uma instalação somente remota não passa no gate de upgrade sem `backupGate.ensaioSemProtecao=true`.

A instalação anterior que usava o PVC único `-backup` recebe dois volumes novos no upgrade. O conteúdo antigo não é migrado. Fazer um backup novo depois do upgrade e antes do próximo upgrade com o gate.

O `backup.filesSecret` contém `rclone.conf`, `backup-publica.asc` e `age-recipients.txt`. O `backup.database.existingSecret` contém as variáveis do banco e o `backup.spreadsheets.existingSecret` contém as variáveis das planilhas.

O detalhamento das chaves, dos volumes e do gate está no [README do chart](../infra/kubernetes/frequenciapp/README.md).

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

O hook de backup roda antes do upgrade e do rollback de revisões que já declaram o hook. Se o recibo estiver ausente, antigo ou divergente, o comando falha antes de alterar o Deployment. Uma revisão anterior à inclusão do hook não o executa no rollback. O rollback do Helm não desfaz migração aplicada.

## Validação

O ensaio reproduzível roda em contêiner, sem cluster:

```bash
bash tests/kubernetes/validar.sh
```

O script executa `helm lint`, `helm template`, `kubeconform -strict`, testa a recusa do gate sem backup, o modo de ensaio, os checksums de ConfigMap e Secret, os dois PVCs, o estado persistente, o `timeZone`, a recusa de backup sem PVC e sem remoto, o modo somente remoto e as oito combinações da agenda.

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

## Limitações

- O chart não instala PostgreSQL.
- O chart não instala cert-manager, ingress controller ou External Secrets.
- O backup local em PVC não é recuperação de desastre. Manter destino remoto.
- O gate reconhece apenas o recibo do backup do banco feito pelo chart. Snapshots externos não contam.
- O CronJob de backup usa a imagem de backup.
- A primeira instalação deve usar uma réplica.
- O `values.exemplo.yaml` é ilustrativo e não contém segredos reais.
