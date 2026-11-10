#!/usr/bin/env bash
# Exercita o chart Kubernetes sem cluster real: helm, kubeconform e o gate de backup.
set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHART="infra/kubernetes/frequenciapp"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-k8s.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

DOCKER_BIN="${DOCKER_BIN:-docker}"
HELM_IMAGE="${HELM_IMAGE:-alpine/helm:latest@sha256:e3f8d5c462d75470fbb1fce79ad5c20063657096d1f98c0fcea869e2600e2e5e}"
KUBECONFORM_IMAGE="${KUBECONFORM_IMAGE:-ghcr.io/yannh/kubeconform:latest@sha256:faffaf43f95aa6425306e1ab8d6fcad72acb9049158f38e574c085ea1ec0f64e}"
NODE_IMAGE="${NODE_IMAGE:-node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9}"
REPO_HOST="${REPO_HOST:-$REPO}"

converter=false
case "$REPO_HOST" in
  [A-Za-z]:*) converter=true ;;
esac

host_path() {
  if [ "$converter" = true ]; then
    if command -v wslpath >/dev/null 2>&1; then
      wslpath -w "$1"
    elif command -v cygpath >/dev/null 2>&1; then
      cygpath -w "$1"
    else
      printf '%s\n' "$1"
    fi
  else
    printf '%s\n' "$1"
  fi
}

docker_run() {
  "$DOCKER_BIN" run --rm "$@"
}

helm() {
  docker_run -v "$(host_path "$REPO"):/repo" -w /repo "$HELM_IMAGE" "$@"
}

kubeconform_file() {
  docker_run -i "$KUBECONFORM_IMAGE" -strict -summary -kubernetes-version 1.27.0 - <"$1"
}

falhar() {
  printf '[kubernetes] %s\n' "$*" >&2
  exit 1
}

exigir_texto() {
  grep -q -- "$1" "$2" || falhar "Não encontrado em $2: $1"
}

exigir_ausencia() {
  if grep -q -- "$1" "$2"; then
    falhar "Encontrado indevidamente em $2: $1"
  fi
}

valor_anotacao() {
  local arquivo="$1"
  local chave="$2"
  grep -m1 "checksum/$chave:" "$arquivo" | sed 's/.*: //' || true
}

executar_gate() {
  local dados="$1"
  shift
  docker_run \
    -v "$(host_path "$REPO"):/repo:ro" \
    -v "$(host_path "$dados"):/dados" \
    -e ESTADO_DIR=/dados/estado \
    -e BACKUP_BANCO_DIR=/dados/banco \
    "$@" \
    "$NODE_IMAGE" bash /repo/infra/kubernetes/frequenciapp/files/verificar-backup.sh
}

valores_backup=(
  --set existingSecret=frequenciapp-segredos
  --set image.tag=1.2.3
  --set backupImage.tag=1.2.3
  --set backup.enabled=true
  --set backup.filesSecret=frequenciapp-backup-arquivos
  --set backup.database.existingSecret=frequenciapp-backup-banco
  --set backup.spreadsheets.existingSecret=frequenciapp-backup-planilhas
  --set backup.database.persistence.enabled=true
  --set backup.spreadsheets.persistence.enabled=true
)

valores_backup_banco=(
  --set existingSecret=frequenciapp-segredos
  --set image.tag=1.2.3
  --set backupImage.tag=1.2.3
  --set backup.enabled=true
  --set backup.filesSecret=frequenciapp-backup-arquivos
  --set backup.database.existingSecret=frequenciapp-backup-banco
  --set backup.spreadsheets.enabled=false
)

renderizar_cronjob_banco() {
  local destino="$1"
  shift
  helm template frequenciapp "$CHART" \
    --namespace frequenciapp \
    --show-only templates/cronjob-backup-banco.yaml \
    "${valores_backup_banco[@]}" "$@" >"$destino"
}

recusar_renderizacao() {
  local rotulo="$1"
  local mensagem="$2"
  shift 2
  if helm template frequenciapp "$CHART" \
    --namespace frequenciapp \
    "${valores_backup_banco[@]}" "$@" >"$TMP/$rotulo.yaml" 2>"$TMP/$rotulo.log"; then
    falhar "O chart aceitou a configuração recusada: $rotulo"
  fi
  exigir_texto "$mensagem" "$TMP/$rotulo.log"
}

printf '[kubernetes] Lint do chart\n'
helm lint "$CHART" --namespace frequenciapp --set existingSecret=frequenciapp-segredos
helm lint "$CHART" --namespace frequenciapp "${valores_backup[@]}"

printf '[kubernetes] Template e kubeconform\n'
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos >"$TMP/instalacao.yaml"
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --is-upgrade \
  "${valores_backup[@]}" >"$TMP/upgrade.yaml"
kubeconform_file "$TMP/instalacao.yaml"
kubeconform_file "$TMP/upgrade.yaml"

printf '[kubernetes] Gate de backup\n'
exigir_texto 'helm.sh/hook: pre-upgrade,pre-rollback' "$TMP/upgrade.yaml"
exigir_texto 'name: frequenciapp-backup-gate' "$TMP/upgrade.yaml"
exigir_texto 'verificar-backup.sh' "$TMP/upgrade.yaml"

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --show-only templates/hook-backup-gate.yaml \
  "${valores_backup[@]}" >"$TMP/hook.yaml"
exigir_texto 'helm.sh/hook: pre-upgrade,pre-rollback' "$TMP/hook.yaml"
exigir_texto 'image: "ghcr.io/eemtijca/frequenciapp-backup:1.2.3"' "$TMP/hook.yaml"
exigir_texto 'claimName: frequenciapp-backup-banco' "$TMP/hook.yaml"
exigir_texto 'readOnly: true' "$TMP/hook.yaml"
exigir_ausencia 'secretRef' "$TMP/hook.yaml"
exigir_ausencia 'valueFrom' "$TMP/hook.yaml"

mkdir -p "$TMP/gate/vazio/estado" "$TMP/gate/vazio/banco"
if executar_gate "$TMP/gate/vazio" >"$TMP/gate-vazio.txt" 2>&1; then
  falhar "O gate aceitou a ausência de recibo de backup."
fi
exigir_texto 'Não há recibo de backup confirmado' "$TMP/gate-vazio.txt"

mkdir -p "$TMP/gate/valido/estado" "$TMP/gate/valido/banco"
arquivo_backup="frequenciapp-20260101T020000Z.dump.gpg"
printf 'conteudo sintetico do backup\n' >"$TMP/gate/valido/banco/$arquivo_backup"
sha_backup=$(sha256sum "$TMP/gate/valido/banco/$arquivo_backup" | cut -d' ' -f1)
em_backup=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"em":"%s","arquivo":"%s","sha256":"%s","verificadoRemoto":false}\n' \
  "$em_backup" "$arquivo_backup" "$sha_backup" >"$TMP/gate/valido/estado/ultimo-backup.json"
executar_gate "$TMP/gate/valido" >"$TMP/gate-valido.txt" 2>&1 ||
  falhar "O gate recusou um backup confirmado."
exigir_texto 'Backup confirmado' "$TMP/gate-valido.txt"

if executar_gate "$TMP/gate/valido" -e BACKUP_GATE_EXIGIR_REMOTO=true \
  >"$TMP/gate-remoto.txt" 2>&1; then
  falhar "O gate aceitou um recibo sem verificação remota."
fi
exigir_texto 'não confirma a verificação da cópia remota' "$TMP/gate-remoto.txt"

cp -R "$TMP/gate/valido" "$TMP/gate/divergente"
printf 'conteudo adulterado\n' >"$TMP/gate/divergente/banco/$arquivo_backup"
if executar_gate "$TMP/gate/divergente" >"$TMP/gate-divergente.txt" 2>&1; then
  falhar "O gate aceitou um arquivo com checksum divergente."
fi
exigir_texto 'diverge do recibo' "$TMP/gate-divergente.txt"

cp -R "$TMP/gate/valido" "$TMP/gate/antigo"
printf '{"em":"2000-01-01T00:00:00Z","arquivo":"%s","sha256":"%s","verificadoRemoto":false}\n' \
  "$arquivo_backup" "$sha_backup" >"$TMP/gate/antigo/estado/ultimo-backup.json"
if executar_gate "$TMP/gate/antigo" >"$TMP/gate-antigo.txt" 2>&1; then
  falhar "O gate aceitou um recibo fora da idade máxima."
fi
exigir_texto 'mais de 36 horas' "$TMP/gate-antigo.txt"

executar_gate "$TMP/gate/vazio" -e ENSAIO_SEM_PROTECAO=true \
  >"$TMP/gate-ensaio.txt" 2>&1 || falhar "O modo de ensaio sem proteção não foi aceito."
exigir_texto 'ENSAIO SEM PROTECAO' "$TMP/gate-ensaio.txt"

printf '[kubernetes] Persistência efetiva do backup do banco\n'
recusar_renderizacao 'sem-pvc-sem-remoto' 'Backup de banco exige PVC ou remoto explicitamente habilitado' \
  --set backup.database.local=false \
  --set backup.database.persistence.enabled=false \
  --set backup.database.remote.enabled=false
recusar_renderizacao 'local-sem-pvc' 'backup.database.local exige persistência habilitada' \
  --set backup.database.local=true \
  --set backup.database.persistence.enabled=false \
  --set backup.database.remote.enabled=true
recusar_renderizacao 'local-nao-booleano' 'backup.database.local deve ser booleano' \
  --set-string backup.database.local=sim
recusar_renderizacao 'persistencia-nao-booleana' 'backup.database.persistence.enabled deve ser booleano' \
  --set-string backup.database.persistence.enabled=sim
recusar_renderizacao 'remoto-nao-booleano' 'backup.database.remote.enabled deve ser booleano' \
  --set-string backup.database.remote.enabled=sim

renderizar_cronjob_banco "$TMP/banco-pvc.yaml" \
  --set backup.database.local=true \
  --set backup.database.persistence.enabled=true
exigir_texto 'name: BACKUP_EXIGIR_REMOTO' "$TMP/banco-pvc.yaml"
grep -A1 'name: BACKUP_EXIGIR_REMOTO' "$TMP/banco-pvc.yaml" | grep -q '"false"' ||
  falhar 'O backup com PVC não deve exigir remoto.'
grep -A1 'name: BACKUP_CATALOGO_PERSISTENTE' "$TMP/banco-pvc.yaml" | grep -q '"true"' ||
  falhar 'O catálogo deve ser persistente com PVC.'
exigir_texto 'claimName: frequenciapp-backup-banco' "$TMP/banco-pvc.yaml"

renderizar_cronjob_banco "$TMP/banco-remoto.yaml" \
  --set backup.database.local=false \
  --set backup.database.persistence.enabled=false \
  --set backup.database.remote.enabled=true
grep -A1 'name: BACKUP_EXIGIR_REMOTO' "$TMP/banco-remoto.yaml" | grep -q '"true"' ||
  falhar 'O backup somente remoto deve exigir destino remoto.'
grep -A1 'name: BACKUP_CATALOGO_PERSISTENTE' "$TMP/banco-remoto.yaml" | grep -q '"false"' ||
  falhar 'O backup somente remoto não deve declarar catálogo persistente.'
exigir_ausencia 'claimName: frequenciapp-backup-banco' "$TMP/banco-remoto.yaml"

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --is-upgrade \
  "${valores_backup_banco[@]}" \
  --set backup.database.local=false \
  --set backup.database.persistence.enabled=false \
  --set backup.database.remote.enabled=true >"$TMP/upgrade-remoto.yaml"
kubeconform_file "$TMP/upgrade-remoto.yaml"
exigir_texto 'value: /backups/estado' "$TMP/upgrade-remoto.yaml"

printf '[kubernetes] Checksums de ConfigMap e Secret\n'
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set-string config.TZ_APP=America/Fortaleza \
  --show-only templates/deployment.yaml >"$TMP/config-a.yaml"
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set-string config.TZ_APP=America/Sao_Paulo \
  --show-only templates/deployment.yaml >"$TMP/config-b.yaml"
checksum_config_a=$(valor_anotacao "$TMP/config-a.yaml" config)
checksum_config_b=$(valor_anotacao "$TMP/config-b.yaml" config)
[ -n "$checksum_config_a" ] || falhar "O Deployment não tem checksum do ConfigMap."
[ "$checksum_config_a" != "$checksum_config_b" ] ||
  falhar "O checksum do ConfigMap não muda com o conteúdo."

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set secrets.create=true \
  --set-string secrets.data.AUTH_SECRET=segredo-a \
  --show-only templates/deployment.yaml >"$TMP/secret-a.yaml"
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set secrets.create=true \
  --set-string secrets.data.AUTH_SECRET=segredo-b \
  --show-only templates/deployment.yaml >"$TMP/secret-b.yaml"
checksum_secret_a=$(valor_anotacao "$TMP/secret-a.yaml" secret)
checksum_secret_b=$(valor_anotacao "$TMP/secret-b.yaml" secret)
[ -n "$checksum_secret_a" ] || falhar "O Deployment não tem checksum do Secret gerenciado."
[ "$checksum_secret_a" != "$checksum_secret_b" ] ||
  falhar "O checksum do Secret gerenciado não muda com o conteúdo."

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set-string existingSecretRevision=1 \
  --show-only templates/deployment.yaml >"$TMP/revisao-1.yaml"
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set-string existingSecretRevision=2 \
  --show-only templates/deployment.yaml >"$TMP/revisao-2.yaml"
checksum_revisao_1=$(valor_anotacao "$TMP/revisao-1.yaml" secret)
checksum_revisao_2=$(valor_anotacao "$TMP/revisao-2.yaml" secret)
[ "$checksum_revisao_1" != "$checksum_revisao_2" ] ||
  falhar "O checksum do existingSecret não usa a revisão explícita sem cluster."

printf '[kubernetes] PVCs e fuso dos CronJobs\n'
total_pvcs=$(grep -c '^kind: PersistentVolumeClaim$' "$TMP/upgrade.yaml" || true)
[ "$total_pvcs" -eq 2 ] || falhar "O chart deve criar dois PVCs distintos."
exigir_texto 'name: frequenciapp-backup-banco' "$TMP/upgrade.yaml"
exigir_texto 'name: frequenciapp-backup-planilhas' "$TMP/upgrade.yaml"
exigir_texto 'helm.sh/resource-policy: keep' "$TMP/upgrade.yaml"

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --show-only templates/cronjob-backup-banco.yaml \
  "${valores_backup[@]}" >"$TMP/cronjob-banco.yaml"
helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --show-only templates/cronjob-backup-planilhas.yaml \
  "${valores_backup[@]}" >"$TMP/cronjob-planilhas.yaml"
exigir_texto 'claimName: frequenciapp-backup-banco' "$TMP/cronjob-banco.yaml"
exigir_texto 'value: /backups/estado' "$TMP/cronjob-banco.yaml"
exigir_texto 'mountPath: /backups' "$TMP/cronjob-banco.yaml"
exigir_ausencia 'claimName: frequenciapp-backup-planilhas' "$TMP/cronjob-banco.yaml"
exigir_texto 'claimName: frequenciapp-backup-planilhas' "$TMP/cronjob-planilhas.yaml"
exigir_texto 'value: /backups/planilhas' "$TMP/cronjob-planilhas.yaml"
exigir_texto 'mountPath: /backups' "$TMP/cronjob-planilhas.yaml"
exigir_ausencia 'claimName: frequenciapp-backup-banco' "$TMP/cronjob-planilhas.yaml"
exigir_ausencia 'name: estado' "$TMP/cronjob-banco.yaml"

total_fusos=$(grep -c 'timeZone: "America/Fortaleza"' "$TMP/upgrade.yaml" || true)
[ "$total_fusos" -eq 3 ] || falhar "Os três CronJobs devem ter timeZone explícito."

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set-string agenda.timeZone=America/Sao_Paulo \
  --show-only templates/cronjob-agenda.yaml >"$TMP/agenda-fuso.yaml"
exigir_texto 'timeZone: "America/Sao_Paulo"' "$TMP/agenda-fuso.yaml"

printf '[kubernetes] Agenda independente e timeout\n'
valor_env() {
  grep -A1 -- "- name: $1" "$2" | sed -n '2s/.*value: "\([^"]*\)".*/\1/p'
}
for mascara in 0 1 2 3 4 5 6 7; do
  notificacoes=false
  planilhas=false
  indicadores=false
  ((mascara & 1)) && notificacoes=true
  ((mascara & 2)) && planilhas=true
  ((mascara & 4)) && indicadores=true
  helm template frequenciapp "$CHART" \
    --namespace frequenciapp \
    --set existingSecret=frequenciapp-segredos \
    --set agenda.notifications="$notificacoes" \
    --set agenda.spreadsheets="$planilhas" \
    --set agenda.indicators="$indicadores" \
    --show-only templates/cronjob-agenda.yaml >"$TMP/agenda-$mascara.yaml"
  [ "$(valor_env AGENDA_NOTIFICACOES "$TMP/agenda-$mascara.yaml")" = "$notificacoes" ] ||
    falhar "AGENDA_NOTIFICACOES divergente na máscara $mascara."
  [ "$(valor_env AGENDA_PLANILHAS "$TMP/agenda-$mascara.yaml")" = "$planilhas" ] ||
    falhar "AGENDA_PLANILHAS divergente na máscara $mascara."
  [ "$(valor_env AGENDA_INDICADORES "$TMP/agenda-$mascara.yaml")" = "$indicadores" ] ||
    falhar "AGENDA_INDICADORES divergente na máscara $mascara."
done

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --show-only templates/cronjob-agenda.yaml >"$TMP/agenda-padrao.yaml"
[ "$(valor_env AGENDA_TIMEOUT "$TMP/agenda-padrao.yaml")" = "300" ] ||
  falhar 'AGENDA_TIMEOUT padrão deve ser 300.'
[ "$(valor_env AGENDA_URL "$TMP/agenda-padrao.yaml")" = "http://frequenciapp:3000" ] ||
  falhar 'AGENDA_URL padrão deve apontar para o Service interno.'

helm template frequenciapp "$CHART" \
  --namespace frequenciapp \
  --set existingSecret=frequenciapp-segredos \
  --set agenda.timeoutSeconds=45 \
  --set agenda.appUrl=http://agenda.interna:3000 \
  --show-only templates/cronjob-agenda.yaml >"$TMP/agenda-customizada.yaml"
[ "$(valor_env AGENDA_TIMEOUT "$TMP/agenda-customizada.yaml")" = "45" ] ||
  falhar 'AGENDA_TIMEOUT não usa agenda.timeoutSeconds.'
[ "$(valor_env AGENDA_URL "$TMP/agenda-customizada.yaml")" = "http://agenda.interna:3000" ] ||
  falhar 'AGENDA_URL não usa agenda.appUrl.'

for caso in 'agenda.notifications=sim|deve ser booleano' 'agenda.timeoutSeconds=0|deve ser um inteiro entre 1 e 2147483' 'agenda.timeoutSeconds=2147484|deve ser um inteiro entre 1 e 2147483'; do
  configuracao="${caso%%|*}"
  mensagem="${caso#*|}"
  if helm template frequenciapp "$CHART" \
    --namespace frequenciapp \
    --set existingSecret=frequenciapp-segredos \
    --set-string "$configuracao" \
    --show-only templates/cronjob-agenda.yaml >"$TMP/agenda-invalida.yaml" 2>"$TMP/agenda-invalida.log"; then
    falhar "O chart aceitou agenda inválida: $configuracao"
  fi
  exigir_texto "$mensagem" "$TMP/agenda-invalida.log"
done

printf '[kubernetes] Ensaios do chart concluídos.\n'
