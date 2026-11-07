#!/usr/bin/env bash
# Gera, valida, cifra e envia o dump do banco PostgreSQL.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
travar backup-banco 0

BACKUP_MODO="${BACKUP_MODO:-compose}"
BACKUP_CRIPTOGRAFIA="${BACKUP_CRIPTOGRAFIA:-gpg}"
BACKUP_BANCO_DIR="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
BACKUP_RETER_DIAS="${BACKUP_RETER_DIAS:-30}"
BACKUP_ESPACO_MINIMO_MB="${BACKUP_ESPACO_MINIMO_MB:-512}"
BACKUP_INCLUIR_AMBIENTE="${BACKUP_INCLUIR_AMBIENTE:-true}"
BACKUP_AMBIENTE_ARQUIVO="${BACKUP_AMBIENTE_ARQUIVO:-$APP_ENV_FILE}"
BACKUP_VERIFICAR_REMOTO="${BACKUP_VERIFICAR_REMOTO:-true}"
DATABASE_SCHEMA="${DATABASE_SCHEMA:-public}"

case "$BACKUP_MODO" in
  compose | url) ;;
  *) erro "BACKUP_MODO inválido: $BACKUP_MODO. Use compose ou url." ;;
esac

case "$BACKUP_CRIPTOGRAFIA" in
  gpg | age) ;;
  *) erro "BACKUP_CRIPTOGRAFIA inválida: $BACKUP_CRIPTOGRAFIA. Use gpg ou age." ;;
esac

mkdir -p "$BACKUP_BANCO_DIR"
chmod 700 "$BACKUP_BANCO_DIR" 2>/dev/null || true

livre=$(espaco_livre_mb "$BACKUP_BANCO_DIR")
if [ "${livre:-0}" -lt "$BACKUP_ESPACO_MINIMO_MB" ]; then
  erro "Espaço insuficiente em $BACKUP_BANCO_DIR: ${livre:-0} MB livres."
fi

tmp=$(mktemp -d "$BACKUP_BANCO_DIR/.tmp.XXXXXX")
# shellcheck disable=SC2154
trap 'status=$?; if [ "$status" -ne 0 ]; then notificar falha "Backup do banco falhou."; fi; rm -rf "$tmp"' EXIT
umask 077

if [ "$BACKUP_MODO" = "compose" ]; then
  montar_compose
fi

if [ "$BACKUP_CRIPTOGRAFIA" = "gpg" ]; then
  [ -n "${BACKUP_GPG_DESTINATARIO:-}" ] || erro "Defina BACKUP_GPG_DESTINATARIO."
  [ -f "${BACKUP_GPG_CHAVE_PUBLICA:-}" ] || erro "Defina BACKUP_GPG_CHAVE_PUBLICA."
  export GNUPGHOME="$tmp/gnupg"
  mkdir -m 700 "$GNUPGHOME"
  gpg --batch --import "$BACKUP_GPG_CHAVE_PUBLICA" >/dev/null 2>&1
else
  [ -f "${BACKUP_AGE_DESTINATARIOS:-}" ] || erro "Defina BACKUP_AGE_DESTINATARIOS."
fi

if [ -n "${BACKUP_REMOTO:-}" ]; then
  [ -n "${BACKUP_RCLONE_CONFIG:-}" ] || erro "Defina BACKUP_RCLONE_CONFIG."
  [ -f "$BACKUP_RCLONE_CONFIG" ] || erro "Configuração do rclone não encontrada."
  [ "$(stat -c '%a' "$BACKUP_RCLONE_CONFIG")" = "600" ] ||
    erro "A configuração do rclone deve ter permissão 600."
fi

cifrar() {
  local origem="$1"
  local destino="$2"
  case "$BACKUP_CRIPTOGRAFIA" in
    gpg)
      gpg --batch --yes --trust-model always \
        --recipient "$BACKUP_GPG_DESTINATARIO" \
        --output "$destino" --encrypt "$origem"
      ;;
    age)
      age --recipients-file "$BACKUP_AGE_DESTINATARIOS" \
        --output "$destino" "$origem"
      ;;
  esac
}

rclone_limpo() {
  local ambiente=(env -i PATH="$PATH" HOME="${HOME:-/tmp}" RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG")
  if [ -n "${RCLONE_CONFIG_PASS:-}" ]; then
    ambiente+=("RCLONE_CONFIG_PASS=$RCLONE_CONFIG_PASS")
  fi
  "${ambiente[@]}" rclone "$@"
}

argumentos_dump=(
  -Fc
  --no-publications
  --no-subscriptions
  --strict-names
  --schema="$DATABASE_SCHEMA"
  --lock-wait-timeout=30s
)

dump="$tmp/dump"
log "Gerando dump do schema $DATABASE_SCHEMA em modo $BACKUP_MODO."
if [ "$BACKUP_MODO" = "compose" ]; then
  compose exec -T db pg_dump \
    -U "${POSTGRES_USER:-frequencia}" \
    -d "${POSTGRES_DB:-frequencia}" \
    "${argumentos_dump[@]}" >"$dump"
else
  url_dump="${BACKUP_DATABASE_URL:-${DIRECT_URL:-}}"
  [ -n "$url_dump" ] || erro "Defina BACKUP_DATABASE_URL ou DIRECT_URL."
  log "Destino do dump: $(mascarar_url "$url_dump")"
  pg_dump "$url_dump" "${argumentos_dump[@]}" >"$dump"
fi

[ -s "$dump" ] || erro "O dump saiu vazio."

if [ "$BACKUP_MODO" = "compose" ]; then
  compose exec -T db pg_restore -l >/dev/null <"$dump" ||
    erro "O dump não passou na validação do pg_restore."
else
  pg_restore -l "$dump" >/dev/null ||
    erro "O dump não passou na validação do pg_restore."
fi

extensao="gpg"
[ "$BACKUP_CRIPTOGRAFIA" = "age" ] && extensao="age"
base="frequenciapp-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
arquivo="$tmp/${base}.dump.${extensao}"
cifrar "$dump" "$arquivo"
(cd "$tmp" && sha256sum "$(basename "$arquivo")" >"$(basename "$arquivo").sha256")

final=("$arquivo" "$arquivo.sha256")

if [ "$BACKUP_INCLUIR_AMBIENTE" = "true" ]; then
  [ -f "$BACKUP_AMBIENTE_ARQUIVO" ] || erro "Arquivo de ambiente não encontrado: $BACKUP_AMBIENTE_ARQUIVO."
  ambiente_arquivo="$tmp/${base}-ambiente.env.${extensao}"
  cifrar "$BACKUP_AMBIENTE_ARQUIVO" "$ambiente_arquivo"
  (cd "$tmp" && sha256sum "$(basename "$ambiente_arquivo")" >"$(basename "$ambiente_arquivo").sha256")
  final+=("$ambiente_arquivo" "$ambiente_arquivo.sha256")
fi

for item in "${final[@]}"; do
  chmod 600 "$item"
  mv "$item" "$BACKUP_BANCO_DIR/"
done

sha=$(cut -d' ' -f1 "$BACKUP_BANCO_DIR/$(basename "$arquivo").sha256")
tamanho=$(stat -c '%s' "$BACKUP_BANCO_DIR/$(basename "$arquivo")")

if [ -n "${BACKUP_REMOTO:-}" ]; then
  remoto="${BACKUP_REMOTO%/}"
  publicar="$tmp/publicar"
  mkdir -p "$publicar"
  for item in "${final[@]}"; do
    cp "$BACKUP_BANCO_DIR/$(basename "$item")" "$publicar/"
  done
  log "Enviando a cópia para $remoto."
  rclone_limpo copy "$publicar" "$remoto" --immutable --checksum
  if [ "$BACKUP_VERIFICAR_REMOTO" = "true" ]; then
    verificacao="$tmp/verificacao"
    mkdir -p "$verificacao"
    nome_arquivo=$(basename "$arquivo")
    rclone_limpo copyto "$remoto/$nome_arquivo" "$verificacao/$nome_arquivo"
    rclone_limpo copyto "$remoto/$nome_arquivo.sha256" "$verificacao/$nome_arquivo.sha256"
    (cd "$verificacao" && sha256sum -c "$nome_arquivo.sha256" >/dev/null) ||
      erro "A cópia remota não passou na verificação de integridade."
  fi
fi

if [ "$BACKUP_RETER_DIAS" -gt 0 ]; then
  # shellcheck disable=SC2012
  mais_recente=$(ls -1t "$BACKUP_BANCO_DIR"/frequenciapp-*.dump.* 2>/dev/null | head -n 1 || true)
  if [ -n "$mais_recente" ]; then
    nome_recente=$(basename "$mais_recente")
    prefixo="${nome_recente%%\.dump.*}"
    find "$BACKUP_BANCO_DIR" -maxdepth 1 -type f -name 'frequenciapp-*' \
      -mtime +"$BACKUP_RETER_DIAS" ! -name "${prefixo}*" -delete
  fi
fi

mkdir -p "$ESTADO_DIR"
estado="$ESTADO_DIR/ultimo-backup.json"
printf '{"em":"%s","modo":"%s","criptografia":"%s","arquivo":"%s","sha256":"%s","tamanho":%s,"schema":"%s","retencaoDias":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$BACKUP_MODO" \
  "$BACKUP_CRIPTOGRAFIA" \
  "$(basename "$arquivo")" \
  "$sha" \
  "$tamanho" \
  "$DATABASE_SCHEMA" \
  "$BACKUP_RETER_DIAS" >"$estado.tmp"
mv "$estado.tmp" "$estado"
chmod 600 "$estado"

notificar sucesso "Backup do banco concluído."
log "Backup concluído: $(basename "$arquivo") (${tamanho} bytes)."
