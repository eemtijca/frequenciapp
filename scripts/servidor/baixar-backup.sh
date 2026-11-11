#!/usr/bin/env bash
# Baixa o último backup confirmado do destino remoto, confere o checksum e pode restaurar.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

uso() {
  cat <<'TEXTO'
Uso: baixar-backup.sh [--destino DIRETORIO] [--restaurar [opções]]

Sem opções, baixa o dump apontado por ultimo-backup.json, confere o checksum
e imprime o caminho local. Com --restaurar, encaminha o arquivo conferido para
restaurar.sh e aceita as opções desse script depois da própria opção.

O download usa rclone, lê BACKUP_REMOTO, BACKUP_RCLONE_CONFIG e o estado em
ESTADO_DIR. Nenhuma credencial é aceita por argumento.
TEXTO
}

destino=""
restaurar=false
extras=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --destino)
      destino="${2:-}"
      [ -n "$destino" ] || erro "Informe um diretório para --destino."
      shift 2
      ;;
    --restaurar)
      restaurar=true
      shift
      ;;
    --ajuda | -h)
      uso
      exit 0
      ;;
    --)
      shift
      extras+=("$@")
      break
      ;;
    *)
      if [ "$restaurar" = true ]; then
        extras+=("$1")
        shift
      else
        erro "Opção desconhecida: $1"
      fi
      ;;
  esac
done

carregar_ambiente

BACKUP_MODO="${BACKUP_MODO:-compose}"
BACKUP_BANCO_DIR="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
BACKUP_REMOTO="${BACKUP_REMOTO:-}"
BACKUP_RCLONE_CONFIG="${BACKUP_RCLONE_CONFIG:-}"
estado="$ESTADO_DIR/ultimo-backup.json"

[ -n "$BACKUP_REMOTO" ] || erro "Defina BACKUP_REMOTO para baixar a cópia remota."
[ -n "$BACKUP_RCLONE_CONFIG" ] || erro "Defina BACKUP_RCLONE_CONFIG para baixar a cópia remota."
verificar_permissao_arquivo "$BACKUP_RCLONE_CONFIG"
[ -f "$estado" ] || erro "Não há estado de backup em $estado."

recibo=$(ler_campo_json "$estado" recibo)
arquivo=$(ler_campo_json "$estado" arquivo)
sha256=$(ler_campo_json "$estado" sha256)
ambiente=$(ler_campo_json "$estado" ambiente)
ambiente_sha=$(ler_campo_json "$estado" ambienteSha256)
remoto_estado=$(ler_campo_json "$estado" remoto)

[[ "$recibo" =~ ^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$ ]] ||
  erro "Backup legado ou ponteiro sem recibo válido."
[[ "$arquivo" =~ ^[A-Za-z0-9._-]+$ ]] || erro "O estado do backup não informa um arquivo válido."
[[ "$sha256" =~ ^[a-f0-9]{64}$ ]] || erro "O estado do backup não informa um checksum válido."
if [ -n "$ambiente" ]; then
  [[ "$ambiente" =~ ^[A-Za-z0-9._-]+$ ]] || erro "O estado do backup não informa um ambiente válido."
  [[ "$ambiente_sha" =~ ^[a-f0-9]{64}$ ]] || erro "O estado do backup não informa o checksum do ambiente."
fi
if [ -n "$remoto_estado" ] && [ "${remoto_estado%/}" != "${BACKUP_REMOTO%/}" ]; then
  erro "O destino remoto atual diverge do estado do último backup."
fi

rclone_limpo() {
  local ambiente_rclone=(
    env -i PATH="$PATH" HOME="${HOME:-/tmp}" RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG"
  )
  if [ -n "${RCLONE_CONFIG_PASS:-}" ]; then
    ambiente_rclone+=("RCLONE_CONFIG_PASS=$RCLONE_CONFIG_PASS")
  fi
  "${ambiente_rclone[@]}" rclone "$@"
}

estagio=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-restauracao.XXXXXX")
chmod 700 "$estagio"
manter_estagio=false
# O material só chega ao destino final depois da conferência. Em falha, o
# estágio é removido para não ser confundido com um backup válido.
trap 'status=$?; if [ "$status" -ne 0 ] || [ "$manter_estagio" != true ]; then rm -rf "$estagio"; fi' EXIT
if [ -n "$destino" ]; then
  mkdir -p "$destino"
  [ -d "$destino" ] || erro "O destino informado não é um diretório."
fi

remoto="${BACKUP_REMOTO%/}"
log "Baixando o recibo e os artefatos de $remoto."
rclone_limpo copyto "$remoto/$recibo" "$estagio/$recibo" ||
  erro "Não foi possível baixar o recibo remoto."
[ -f "$estagio/$recibo" ] || erro "O recibo remoto não chegou ao diretório local."
tamanho_recibo=$(stat -c '%s' "$estagio/$recibo")
[ "$tamanho_recibo" -le 1048576 ] || erro "O recibo remoto excede o limite aceito."
jq -e --arg recibo "$recibo" '.base + ".confirmado.json" == $recibo' \
  "$estagio/$recibo" >/dev/null ||
  erro "O nome do recibo remoto diverge do conteúdo."
jq -e --arg remoto "$remoto" '(.remoto | sub("/+$"; "")) == $remoto' "$estagio/$recibo" >/dev/null ||
  erro "O recibo remoto aponta para outro destino."

nomes=()
jq -er '.artefatos[]?.nome' "$estagio/$recibo" >"$estagio/.artefatos" ||
  erro "O recibo remoto não lista artefatos válidos."
while IFS= read -r nome; do
  [[ "$nome" =~ ^[A-Za-z0-9._-]+$ ]] || erro "O recibo remoto contém um nome inválido."
  nomes+=("$nome")
done <"$estagio/.artefatos"
rm -f "$estagio/.artefatos"
[ "${#nomes[@]}" -gt 0 ] || erro "O recibo remoto não lista artefatos."

jq -e --arg nome "$arquivo" --arg sha "$sha256" \
  'any(.artefatos[]?; .nome == $nome and .sha256 == $sha)' \
  "$estagio/$recibo" >/dev/null ||
  erro "O estado do backup diverge do recibo remoto."
if [ -n "$ambiente" ]; then
  jq -e --arg nome "$ambiente" --arg sha "$ambiente_sha" \
    'any(.artefatos[]?; .nome == $nome and .sha256 == $sha)' \
    "$estagio/$recibo" >/dev/null ||
    erro "O ambiente do backup diverge do recibo remoto."
fi

for nome in "${nomes[@]}"; do
  rclone_limpo copyto "$remoto/$nome" "$estagio/$nome" ||
    erro "Não foi possível baixar $nome do destino remoto."
done

node "$DIR/recibos.mjs" conferir "$estagio" "$estagio/$recibo" ||
  erro "Recibo ou artefatos baixados não conferem."
calculado=$(sha256sum "$estagio/$arquivo" | cut -d' ' -f1)
[ "$calculado" = "$sha256" ] || erro "O checksum do dump baixado não confere."
if [ -n "$ambiente" ]; then
  calculado_ambiente=$(sha256sum "$estagio/$ambiente" | cut -d' ' -f1)
  [ "$calculado_ambiente" = "$ambiente_sha" ] ||
    erro "O checksum do ambiente baixado não confere."
fi

if [ -z "$destino" ]; then
  destino="$estagio"
  manter_estagio=true
else
  for nome in "${nomes[@]}"; do
    mv "$estagio/$nome" "$destino/$nome"
  done
  mv "$estagio/$recibo" "$destino/$recibo"
fi

log "Backup baixado e conferido: $destino/$arquivo"
printf '%s\n' "$destino/$arquivo"

if [ "$restaurar" = true ]; then
  restaurador="${RESTAURAR_SCRIPT:-$DIR/restaurar.sh}"
  log "Encaminhando o backup conferido para a restauração."
  bash "$restaurador" --arquivo "$destino/$arquivo" --checksum "$sha256" --confirmar "${extras[@]}"
fi
