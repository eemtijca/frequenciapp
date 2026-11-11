# Chart Helm do FrequenciApp

Chart de referência para executar o FrequenciApp em Kubernetes. A aplicação é a mesma imagem OCI usada no Compose e na Vercel; o chart não instala PostgreSQL e não impõe um controlador de Ingress.

A decisão e o contrato portátil estão na [ADR-064](../../../docs/adr/064-auto-hospedagem-servidor.md). O guia de servidor está em [auto-hospedagem.md](../../../docs/auto-hospedagem.md) e o backup em [backup-servidor.md](../../../docs/backup-servidor.md).

## O que o chart entrega

- Deployment com initContainer de migração e checksum de ConfigMap e Secret no template do Pod.
- Hook `pre-upgrade` e `pre-rollback` com recibo HMAC no perfil URL explicitamente adotado; recusa sem adoção ou prova válida.
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

A primeira instalação não executa o hook e pode migrar um banco existente. Identificar o alvo, comprovar recuperação e obter autorização antes da instalação; não presumir banco vazio. `upgrade --install` pode executar um upgrade, não apenas uma instalação.

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

O contêiner principal recebe `MIGRAR_NA_PARTIDA=false`. O migrador usa a trava consultiva do banco e a conferência de checksum já existente. No perfil adotado, `origem-backup.mjs executar` valida o alvo antes de executar migrador ou entrada original do aplicativo. Os três consumidores recebem as URLs da mesma chave `url` de `backupOrigin.connectionSecret`, conferidas contra `backupOrigin.policySecret`. O HMAC de `backupOrigin.hmacSecret` só é montado no produtor e hook; `extraEnvFrom` e overrides reservados são recusados.

### Confirmação de backup antes do upgrade

O chart renderiza o Job `backup-gate` para `pre-upgrade` e `pre-rollback`. Com `backupOrigin.adopted=true`, policy e CA externas imutáveis, conexão única e Secret HMAC separado, o produtor URL direto TLS exporta um snapshot e autentica identidade, escopo, timestamps e hashes exatos dos artefatos. O hook valida contra essa autoridade independente e permite o conjunto válido; sem adoção ou prova válida, recusa. O contrato, a policy, os Secrets e as premissas estão em [origem-backup.md](../../../docs/origem-backup.md).

O script também aceita `--diagnosticar-integridade`, fora do hook: confere idade, ponteiro, recibo e hashes locais e, se solicitado, a confirmação remota registrada. Não consulta o destino remoto nem comprova sua disponibilidade, a origem ou a restauração. Um diagnóstico positivo não autoriza upgrade. `backupGate.maxAgeHours` e `backupGate.requireRemoteVerification` restringem o hook autenticado, mas não substituem HMAC e policy.

`backupGate.ensaioSemProtecao=true` agora é recusado no template e a variável antiga não contorna o hook. O diagnóstico não autoriza operação protegida. A primeira instalação não executa o hook, ainda que aponte a um banco existente.

O ConfigMap do script também é hook, com peso anterior ao Job. Um rollback pode executar hook ou script antigo, ou nenhum hook. Inspecionar as revisões e não presumir proteção em transições sem teste em cluster. `--no-hooks`, `kubectl apply` e operações fora do Helm também contornam o gate; não são solução para produção.

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
  notifications: true
  spreadsheets: true
  indicators: true
  schedule: "*/5 * * * *"
  timeZone: "America/Fortaleza"
  timeoutSeconds: 300
  appUrl: ""
  existingSecret: ""
```

Cada seletor liga ou desliga uma chamada independente. Uma falha em uma rotina não impede as seguintes. `timeoutSeconds` é validado entre 1 e 2147483 e vale para cada requisição.

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

| Chave                             | Uso                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `BACKUP_DATABASE_URL`             | URL do banco para o dump                                                                       |
| `BACKUP_CRIPTOGRAFIA`             | `gpg` ou `age`                                                                                 |
| `BACKUP_GPG_DESTINATARIO`         | Destinatário GPG                                                                               |
| `BACKUP_AGE_DESTINATARIOS_SHA256` | SHA-256 independente do arquivo de destinatários age, em 64 caracteres hexadecimais minúsculos |
| `BACKUP_REMOTO`                   | Destino rclone                                                                                 |
| `RCLONE_CONFIG_PASS`              | Senha da configuração do rclone, quando usada                                                  |

Para age, o template fixa `BACKUP_AGE_DESTINATARIOS=/etc/frequenciapp/age-recipients.txt`, montado a partir de `backup.filesSecret`; um valor com esse nome no Secret do banco não substitui o caminho explícito do template. O pin é obrigatório, corresponde aos bytes exatos do arquivo e deve ser conferido por canal independente antes de ser configurado no Secret do banco. A conferência depende da proteção independente do pin; controlar tanto o arquivo quanto o pin não comprova a identidade dos destinatários.

A rotina usa `BACKUP_MODO=url`, `BACKUP_INCLUIR_AMBIENTE=false`, `BACKUP_RETER_DIAS`, `BACKUP_RETER_MINIMO` e `BACKUP_RETER_REMOTO` do values. A retenção padrão é 30 dias e mínimo de 30 conjuntos, com overrides positivos explícitos permitidos. Autenticação do hook não habilita exclusão: no modo URL, inclusive adotado, a rotina mantém expurgos local/remoto suspensos neste recorte. Monitore capacidade do PVC e do remoto e planeje gestão independente das cópias; o acúmulo pode esgotar espaço.

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

Uma revisão que substitui o PVC antigo `-backup` por dois volumes não move seu conteúdo. Um hook prévio pode bloquear a criação dos novos PVCs e CronJobs, portanto não se deve pressupor que seja possível fazer backup depois do upgrade. Planejar previamente migração e recuperação comprovadas; não contornar o bloqueio em produção.

O estado do backup do banco fica em `/backups/estado/ultimo-backup.json`, no PVC do banco. O backup das planilhas mantém o arquivo confirmado e o `.confirmado.json` em `/backups/planilhas`, no PVC das planilhas. Os PVCs carregam `helm.sh/resource-policy: keep` e não são removidos pelo `helm uninstall`.

`backup.database.persistence.enabled` e `backup.spreadsheets.persistence.enabled` são `true` por padrão. Sem o PVC do banco, o recibo não sobrevive ao Job; o perfil de origem adotado exige esse PVC. Sem o PVC das planilhas, a cópia local não é feita e o destino remoto precisa estar configurado.

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

Este comando exige preparação e autorização. No perfil adotado, o hook aceita somente backup autenticado, recente e compatível com a policy; sem adoção, recusa. Isso não garante a saúde do serviço já existente. Scripts de revisões anteriores podem ter comportamento diferente.

Rollback do Helm:

```bash
helm history frequenciapp --namespace frequenciapp
helm rollback frequenciapp <revisao> --namespace frequenciapp
```

O rollback do Helm não desfaz migração aplicada e pode usar hook ou script antigos, ou nenhum hook. A compatibilidade da imagem anterior com o banco migrado não está comprovada; não executar rollback automático como recuperação presumida. A restauração exige planejamento e prova independente de recuperação.

## Testes

O executor usa Docker e não cria cluster. Ele depende das imagens e, para os schemas do kubeconform, pode exigir rede; não é prova de isolamento e não deve alcançar recursos de produção:

```bash
bash tests/kubernetes/validar.sh
```

Ele executa `helm lint`, `helm template`, `kubeconform -strict` e confere o gate de backup, os checksums de ConfigMap e Secret, os dois PVCs, o estado persistente, o `timeZone`, a recusa de backup sem persistência, o modo somente remoto e as oito combinações da agenda.

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
- O backup local em PVC não é recuperação de desastre. A confirmação remota registrada no diagnóstico não demonstra disponibilidade atual nem recuperação.
- O gate aceita o produtor URL autenticado no perfil direto adotado, não recibos legados ou snapshots externos. Operador, produtor e Secrets protegidos são premissas; não há prova contra DBA ou root comprometido.
- O CronJob de backup usa a imagem de backup, não a imagem da aplicação.
- O `values.exemplo.yaml` é ilustrativo e não contém segredos reais.
- A primeira instalação deve usar uma réplica. O aumento de réplicas depende de migração concluída e do limite de tentativas compartilhado no banco.
- O teste `helm test` depende de a imagem estar acessível ao cluster.

## Contratos operacionais

A agenda expõe `agenda.notifications`, `agenda.spreadsheets` e `agenda.indicators`, todos booleanos com padrão `true`, além de `agenda.timeoutSeconds`. Valores desligados não geram chamadas. Manter apenas uma agenda ativa de indicadores entre plataformas.

O backup do banco precisa de PVC (`backup.database.persistence.enabled=true`) ou de `backup.database.remote.enabled=true`. `backup.database.local=true` exige persistência; para somente remoto, usar `local=false` e `persistence.enabled=false`. Sem PVC, o chart injeta `BACKUP_EXIGIR_REMOTO=true` e a rotina recusa remoto vazio ou verificação desligada. O estado usa `/backups/estado`, persistindo junto com os dumps quando o PVC está habilitado.

O diagnóstico e o hook autenticado leem os artefatos no PVC do banco. Sem PVC, não há catálogo persistente e o perfil adotado é recusado. Declarar destino no Secret não comprova transporte nem recuperação. Os testes focalizados de CLI/TLS/snapshot/cifra/hook/recuperação e Helm lint/template foram executados sem cluster ou dados reais; comandos, dependências e limites constam em [origem-backup.md](../../../docs/origem-backup.md).
