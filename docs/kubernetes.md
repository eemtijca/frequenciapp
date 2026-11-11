# Kubernetes

Referência para executar o FrequenciApp em Kubernetes com o chart Helm de `infra/kubernetes/frequenciapp`. O chart é opcional; a aplicação continua sendo uma imagem OCI com PostgreSQL 17 e variáveis de ambiente.

O contrato portátil está na [ADR-064](adr/064-auto-hospedagem-servidor.md). A instalação em servidor com Compose está em [auto-hospedagem.md](auto-hospedagem.md) e o backup em [backup-servidor.md](backup-servidor.md).

## O que o chart entrega

- Deployment com initContainer de migração e checksum de ConfigMap e Secret no template do Pod.
- Hook `pre-upgrade` e `pre-rollback` operacional no perfil URL explicitamente adotado, com HMAC, policy independente e hashes streaming; recusa sem adoção ou recibo válido.
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

A primeira instalação não executa o hook, mas o initContainer pode migrar um banco existente. Não presumir banco vazio: identificar o alvo e obter backup recuperável e autorização para a migração antes de instalar. `upgrade --install` também pode ser upgrade, sujeito ao bloqueio descrito abaixo.

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

O initContainer executa `node ./docker/app/migrar.mjs`. O contêiner principal usa `MIGRAR_NA_PARTIDA=false`. No perfil adotado, ambos passam antes pelo wrapper `origem-backup.mjs executar`, que confere configuração e identidade operacional. Runtime, migrador e produtor recebem a mesma chave `url` de `backupOrigin.connectionSecret`; a policy e a CA ficam em `backupOrigin.policySecret`, e somente produtor/hook recebem `backupOrigin.hmacSecret`. `extraEnvFrom` opaco e overrides reservados são recusados. A chave HMAC não é montada no Deployment.

O chart renderiza o Job `backup-gate` para `pre-upgrade` e `pre-rollback`. O perfil `backupOrigin.adopted=true` autentica o recibo HMAC contra policy e chave em Secrets independentes, fora do PVC, e confere identidade, produtor, escopo, timestamps e hashes streaming de todos os artefatos. O produtor usa PostgreSQL direto TLS em IPv4 fixo e snapshot exportado, mantendo a sessão de identidade aberta durante o dump. Sem adoção, com perfil incompatível ou recibo legado, o gate recusa; não bloqueia incondicionalmente o perfil válido. O modelo completo e a preparação dos Secrets estão em [origem-backup.md](origem-backup.md).

O script oferece `--diagnosticar-integridade` separadamente: confere idade, ponteiro, recibo e hashes locais, e pode exigir que os recibos registrem verificação remota. Não consulta o remoto nem comprova origem, disponibilidade atual ou restauração. Sucesso no diagnóstico não autoriza operação protegida. `backupGate.maxAgeHours=36` e `backupGate.requireRemoteVerification` também restringem o hook autenticado; não substituem a assinatura e a policy.

`backupGate.ensaioSemProtecao=true` agora é recusado na renderização e a variável antiga não contorna o hook. O diagnóstico permanece separado da autorização. A primeira instalação não executa o hook, mesmo que use banco já existente.

O ConfigMap do script também é hook, com peso anterior ao Job. Um rollback para revisão antiga pode selecionar hook e script antigos ou não ter hook. Inspecionar as revisões e não presumir proteção em transições sem teste em cluster. `helm --no-hooks`, recursos aplicados diretamente e operações fora do Helm também contornam os hooks; não usar esses caminhos para liberar produção.

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

O backup é opcional na instalação. O chart cria CronJobs separados para banco e planilhas quando `backup.enabled=true`. Recibos do perfil adotado são autenticados; recibos legados não liberam o gate. A retenção tem 30 dias e mínimo de 30 conjuntos por padrão, com overrides positivos explícitos permitidos. A autenticação de origem não habilita exclusão: o produtor URL, inclusive adotado, mantém expurgos local/remoto suspensos neste recorte. Monitore capacidade do PVC e do remoto e não remova conjuntos sem procedimento seguro autorizado.

Cada rotina tem o próprio PVC `ReadWriteOnce`: `-backup-banco` para o dump e o recibo, `-backup-planilhas` para os arquivos confirmados. O estado do banco fica em `/backups/estado/ultimo-backup.json`; o backup das planilhas fica em `/backups/planilhas`. O PVC do banco fornece os artefatos ao diagnóstico e ao hook autenticado. O perfil adotado exige esse PVC. Sem o PVC das planilhas, a cópia local não é feita e o destino remoto precisa estar configurado. Os PVCs usam `helm.sh/resource-policy: keep` e não são removidos pelo `helm uninstall`.

O backup do banco exige PVC ou `backup.database.remote.enabled=true`. Com `backup.database.local=true`, o PVC é obrigatório. No modo somente remoto, definir `local=false` e `persistence.enabled=false`; o chart injeta `BACKUP_EXIGIR_REMOTO=true` e a rotina recusa remoto vazio ou verificação desligada. Sem PVC, o diagnóstico não tem catálogo persistente e o perfil adotado não é aceito pelo chart.

Uma revisão que troca o PVC único `-backup` por dois volumes não migra o conteúdo antigo. O hook prévio pode impedir a criação dos novos PVCs e CronJobs, portanto produzir um backup depois desse upgrade não resolve o bootstrap bloqueado. Não contornar o bloqueio em produção; planejar separadamente a migração de dados e a recuperação com prova de origem antes de qualquer alteração.

O `backup.filesSecret` contém `rclone.conf`, `backup-publica.asc` e `age-recipients.txt`. Para age, o chart fixa o caminho `/etc/frequenciapp/age-recipients.txt`; o Secret de variáveis do banco deve fornecer também `BACKUP_AGE_DESTINATARIOS_SHA256`, hash SHA-256 dos bytes desse arquivo conferido por canal independente. O `backup.database.existingSecret` contém as demais variáveis do banco e o `backup.spreadsheets.existingSecret` contém as variáveis das planilhas.

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

Os comandos acima exigem preparação e autorização: no perfil adotado, o hook permite somente o conjunto autenticado, recente e compatível com a policy esperada; sem adoção, recusa. A falha do hook não garante que o serviço anterior esteja saudável. Revisões e scripts anteriores podem não bloquear; `--no-hooks` também ignora o gate. O rollback do Helm não desfaz migração aplicada, e não há prova de compatibilidade da imagem antiga com o banco migrado. Não executar rollback automático como recuperação presumida.

## Validação

O executor usa Docker e não cria cluster. Ele depende das imagens e, para os schemas do kubeconform, pode exigir rede; não é uma prova de isolamento nem deve ser executado contra recursos de produção:

```bash
bash tests/kubernetes/validar.sh
```

O script reúne `helm lint`, `helm template`, `kubeconform -strict` e testes sintéticos do gate/diagnóstico, PVC, configuração e agenda. A execução completa desse agregador não foi realizada neste recorte. Separadamente, foram executados Helm lint/template locais e o fluxo real CLI, TLS, snapshot, cifra, hook e recuperação de linha sintética em PostgreSQL descartável, sem rede, portas ou mounts do host. Dependências e comandos focalizados estão em [origem-backup.md](origem-backup.md). Não houve cluster, publicação de imagem ou Dropbox real.

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
- O gate aceita o produtor URL autenticado no perfil direto adotado, não recibos legados ou snapshots externos. A premissa é operador/produtor/Secrets protegidos; não há garantia contra DBA ou root comprometido.
- O CronJob de backup usa a imagem de backup.
- A primeira instalação deve usar uma réplica.
- O `values.exemplo.yaml` é ilustrativo e não contém segredos reais.
