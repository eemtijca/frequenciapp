# ADR-068: backup confirmado, rollout por checksum e volumes separados no Kubernetes

## Estado

Implementada para revisão.

## Contexto

O chart Helm da ADR-064 aplicava a migração no initContainer antes de qualquer confirmação de backup. As issues #433, #441 e #444 registraram três riscos independentes:

- um `helm upgrade` podia migrar e trocar os Pods sem um backup do banco confirmado;
- alterações no ConfigMap ou no Secret não alteravam o template do Pod, então o rollout dependia de reinício manual;
- os CronJobs de backup do banco e das planilhas compartilhavam um PVC `ReadWriteOnce`, o estado do último backup ficava em `emptyDir` e o fuso dos CronJobs era opcional.

O cenário é estático e foi reproduzido com `helm template`, `helm lint` e `kubeconform`, sem cluster real, sem dados de alunos e sem credenciais.

## Decisão

### Backup antes de migração e rollout

- O chart cria um Job de hook `pre-upgrade` e `pre-rollback` chamado `backup-gate`.
- O hook usa a imagem de backup já publicada, não monta Secret e não depende de credencial real.
- O Job lê o recibo `ultimo-backup.json` gravado pela rotina `backup-banco` no PVC do banco. O recibo contém data, arquivo, SHA-256 e o resultado da verificação remota.
- O gate recusa o upgrade quando o recibo não existe, está fora de `backupGate.maxAgeHours`, aponta para arquivo ausente ou tem checksum divergente.
- `backupGate.requireRemoteVerification=true` exige que o recibo confirme a cópia remota.
- O gate é sempre renderizado e o padrão é bloquear. O único modo de prosseguir sem confirmação é `backupGate.ensaioSemProtecao=true`, um nome explícito que declara a ausência de proteção e de promessa de recuperação. O valor padrão é `false`.
- A primeira instalação não executa o hook, porque não há dados anteriores a proteger.
- O hook roda antes da criação dos recursos do upgrade, então a falha impede a migração e a troca de Pods.

### Rollout por checksum

- O template do Deployment recebe `checksum/config`, calculado a partir do ConfigMap renderizado.
- Com `secrets.create=true`, `checksum/secret` usa o Secret renderizado pelo chart.
- Com `existingSecret`, `checksum/secret` usa `lookup` do Secret no cluster. Quando o lookup não existe, como em `helm template` offline, o checksum usa `existingSecretRevision`, um valor explícito nos values.
- A revisão explícita não descobre sozinha uma alteração feita fora do Helm. O operador precisa incrementá-la, ou usar um gerenciador que atualize o valor no arquivo de values.

### PVCs, estado e fuso

- O backup do banco usa o PVC `-backup-banco`; o backup das planilhas usa o PVC `-backup-planilhas`. Cada CronJob monta apenas o próprio volume.
- O estado do banco fica em `/backups/estado/ultimo-backup.json`, no PVC do banco. O backup das planilhas mantém o arquivo confirmado e o `.confirmado.json` em `/backups/planilhas`, no PVC das planilhas.
- Os dois PVCs usam `helm.sh/resource-policy: keep` para sobreviver ao `helm uninstall`.
- `backup.database.persistence.enabled` e `backup.spreadsheets.persistence.enabled` são `true` por padrão. Sem o PVC do banco, o gate falha; sem o PVC das planilhas, a cópia local não é feita e o destino remoto precisa estar configurado.
- `agenda.timeZone`, `backup.database.timeZone` e `backup.spreadsheets.timeZone` são sempre renderizados e usam `America/Fortaleza` como padrão. Os três valores continuam sobrescrevíveis.

### Testes

- `tests/kubernetes/validar.sh` roda em contêiner e não usa cluster.
- O ensaio cobre `helm lint`, `helm template`, `kubeconform -strict`, a presença do hook e a recusa sem recibo, o modo de ensaio, a mudança dos checksums, os dois PVCs, o estado persistente e o `timeZone`.
- O workflow `Servidor` executa o ensaio em passo próprio.

## Alternativas consideradas

### Apenas recusar no template sem hook

Uma condição de template bloqueia o upgrade quando o backup está desabilitado, mas não confirma que o backup mais recente existe, está íntegro e está dentro da idade máxima. O hook verifica o estado real no PVC.

### Compartilhar um PVC entre os dois CronJobs

Um PVC `ReadWriteOnce` não pode ser montado por dois Pods em nós diferentes ao mesmo tempo. Separar os volumes elimina a disputa e permite evoluir a retenção de cada rotina sem afetar a outra.

### Manter o estado em emptyDir

O recibo do último backup desaparece quando o Pod termina. Sem ele, o gate não consegue provar que existe um ponto de recuperação. O estado passa a viver no PVC da rotina.

### Usar lookup como única fonte do checksum

`helm template` offline não tem cluster e o lookup retorna vazio. A revisão explícita mantém o template reproduzível e dá ao operador um sinal determinístico para provocar o rollout.

### Padrão permissivo para o ensaio

Um valor padrão que permite upgrade sem backup transformaria a exceção em regra. O ensaio tem nome próprio, padrão `false` e aviso no `helm install` e no `helm upgrade`.

## Consequências

### Positivas

- Nenhum upgrade e nenhum rollback de revisão com o hook aplica migração sem um recibo de backup íntegro e recente, fora do modo de ensaio explícito.
- O gate roda com a imagem de backup publicada e sem Secret, então pode ser testado sem credencial.
- ConfigMap e Secret alterados provocam rollout sem reinício manual.
- Os CronJobs deixam de disputar um PVC `ReadWriteOnce`.
- O estado do último backup do banco e as cópias das planilhas sobrevivem ao Job e ao `helm uninstall`.
- O fuso dos três CronJobs deixa de depender do fuso do cluster.

### Negativas e riscos

- O primeiro upgrade depois de habilitar o backup exige que o PVC e o CronJob de backup já tenham produzido um recibo. Uma instalação antiga pode precisar de um backup manual antes do primeiro upgrade com o gate.
- O gate não reconhece snapshots externos do PostgreSQL nem backups feitos fora do chart.
- O `pre-rollback` só existe em revisões que já declaram o hook. Um rollback para uma revisão anterior à ADR-068 não executa o gate.
- A troca do PVC único `-backup` por `-backup-banco` e `-backup-planilhas` não move o conteúdo antigo. A instalação existente precisa de um backup novo depois do upgrade.
- O PVC `ReadWriteOnce` continua limitando cada rotina a um nó por vez; o CronJob usa `concurrencyPolicy: Forbid` e não escala em paralelo. O gate também lê o PVC do banco e pode aguardar se o Job de backup estiver montando o volume.
- `existingSecretRevision` é manual. Sem cluster e sem incremento, uma alteração externa no Secret não dispara o rollout.
- O `lookup` do `existingSecret` exige permissão de leitura de Secrets para quem executa o Helm.
- O `helm.sh/resource-policy: keep` preserva os PVCs no `helm uninstall`, mas uma reinstalação que precise recriar os volumes exige remoção manual.
- O modo `ensaioSemProtecao` permite upgrade sem proteção por decisão explícita do operador.
