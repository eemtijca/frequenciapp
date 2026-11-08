#!/usr/bin/env bash
# Gera, valida, cifra e envia o dump do banco PostgreSQL.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

verificar_somente=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar)
      verificar_somente=true
      shift
      ;;
    --ajuda | -h)
      cat <<'TEXTO'
Uso: backup-banco.sh [--verificar]

Sem opções, gera um novo backup. Com --verificar, confere o último backup
local e, quando configurado, a cópia remota.
TEXTO
      exit 0
      ;;
    *)
      erro "Opção desconhecida: $1"
      ;;
  esac
done

carregar_ambiente
travar backup-banco 0

BACKUP_MODO="${BACKUP_MODO:-compose}"
BACKUP_CRIPTOGRAFIA="${BACKUP_CRIPTOGRAFIA:-gpg}"
BACKUP_BANCO_DIR="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
BACKUP_RETER_DIAS="${BACKUP_RETER_DIAS:-30}"
BACKUP_RETER_MINIMO="${BACKUP_RETER_MINIMO:-5}"
BACKUP_ESPACO_MINIMO_MB="${BACKUP_ESPACO_MINIMO_MB:-512}"
BACKUP_INCLUIR_AMBIENTE="${BACKUP_INCLUIR_AMBIENTE:-true}"
BACKUP_AMBIENTE_ARQUIVO="${BACKUP_AMBIENTE_ARQUIVO:-$APP_ENV_FILE}"
BACKUP_VERIFICAR_REMOTO="${BACKUP_VERIFICAR_REMOTO:-true}"
BACKUP_RETER_REMOTO="${BACKUP_RETER_REMOTO:-false}"
DATABASE_SCHEMA="${DATABASE_SCHEMA:-public}"

case "$BACKUP_MODO" in
  compose | url) ;;
  *) erro "BACKUP_MODO inválido: $BACKUP_MODO. Use compose ou url." ;;
esac

case "$BACKUP_CRIPTOGRAFIA" in
  gpg | age) ;;
  *) erro "BACKUP_CRIPTOGRAFIA inválida: $BACKUP_CRIPTOGRAFIA. Use gpg ou age." ;;
esac

case "$BACKUP_RETER_MINIMO" in
  '' | *[!0-9]*) erro "BACKUP_RETER_MINIMO deve ser um número inteiro maior ou igual a zero." ;;
esac
case "$BACKUP_RETER_DIAS" in
  '' | *[!0-9]*) erro "BACKUP_RETER_DIAS deve ser um número inteiro maior ou igual a zero." ;;
esac
case "$BACKUP_RETER_REMOTO" in
  true | false) ;;
  *) erro "BACKUP_RETER_REMOTO inválido: $BACKUP_RETER_REMOTO. Use true ou false." ;;
esac

estado="$ESTADO_DIR/ultimo-backup.json"

mkdir -p "$BACKUP_BANCO_DIR"
chmod 700 "$BACKUP_BANCO_DIR" 2>/dev/null || true
mkdir -p "$ESTADO_DIR"
chmod 700 "$ESTADO_DIR" 2>/dev/null || true

tmp=$(mktemp -d "$BACKUP_BANCO_DIR/.tmp.XXXXXX")
trap 'status=$?; if [ "$status" -ne 0 ]; then notificar falha "Backup do banco falhou."; fi; rm -rf "$tmp"' EXIT
umask 077

definir_extensao() {
  if [ "$BACKUP_CRIPTOGRAFIA" = "age" ]; then
    extensao="age"
  else
    extensao="gpg"
  fi
}

preparar_criptografia() {
  if [ "$BACKUP_CRIPTOGRAFIA" = "gpg" ]; then
    [ -n "${BACKUP_GPG_DESTINATARIO:-}" ] || erro "Defina BACKUP_GPG_DESTINATARIO."
    [ -f "${BACKUP_GPG_CHAVE_PUBLICA:-}" ] || erro "Defina BACKUP_GPG_CHAVE_PUBLICA."
    export GNUPGHOME="$tmp/gnupg"
    mkdir -m 700 "$GNUPGHOME"
    gpg --batch --import "$BACKUP_GPG_CHAVE_PUBLICA" >/dev/null ||
      erro "Não foi possível importar a chave pública GPG."
  else
    [ -f "${BACKUP_AGE_DESTINATARIOS:-}" ] || erro "Defina BACKUP_AGE_DESTINATARIOS."
  fi
}

cifrar_fluxo() {
  local destino="$1"
  case "$BACKUP_CRIPTOGRAFIA" in
    gpg)
      gpg --batch --yes --trust-model always \
        --recipient "$BACKUP_GPG_DESTINATARIO" \
        --output "$destino" --encrypt
      ;;
    age)
      age --recipients-file "$BACKUP_AGE_DESTINATARIOS" \
        --output "$destino"
      ;;
  esac
}

preparar_rclone() {
  [ -n "${BACKUP_REMOTO:-}" ] || return 0
  [ -n "${BACKUP_RCLONE_CONFIG:-}" ] || erro "Defina BACKUP_RCLONE_CONFIG."
  verificar_permissao_arquivo "$BACKUP_RCLONE_CONFIG"
  # Em Kubernetes o Secret é montado com dono e modo do volume. A cópia
  # privada garante a permissão 600 exigida pelo processo de transporte.
  cp "$BACKUP_RCLONE_CONFIG" "$tmp/rclone.conf"
  chmod 600 "$tmp/rclone.conf"
  BACKUP_RCLONE_CONFIG="$tmp/rclone.conf"
}

rclone_limpo() {
  local ambiente=(env -i PATH="$PATH" HOME="${HOME:-/tmp}" RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG")
  if [ -n "${RCLONE_CONFIG_PASS:-}" ]; then
    ambiente+=("RCLONE_CONFIG_PASS=$RCLONE_CONFIG_PASS")
  fi
  "${ambiente[@]}" rclone "$@"
}

verificar_arquivo_local() {
  local arquivo="$1"
  local esperado="$2"
  local calculado
  [ -f "$arquivo" ] || erro "Arquivo de backup não encontrado: $arquivo."
  calculado=$(sha256sum "$arquivo" | cut -d' ' -f1)
  [ "$calculado" = "$esperado" ] ||
    erro "O checksum local de $(basename "$arquivo") não confere."
}

verificar_item_remoto() {
  local nome="$1"
  local esperado="$2"
  local destino="$tmp/verificacao/$nome"
  mkdir -p "$(dirname "$destino")"
  rclone_limpo copyto "${BACKUP_REMOTO%/}/$nome" "$destino" ||
    erro "Não foi possível baixar $nome do destino remoto."
  local calculado
  calculado=$(sha256sum "$destino" | cut -d' ' -f1)
  [ "$calculado" = "$esperado" ] ||
    erro "A cópia remota de $nome diverge do hash local."
}

verificar_ultimo_backup() {
  [ -f "$estado" ] || erro "Não há estado de backup em $estado."
  local arquivo
  local sha
  local ambiente
  local ambiente_sha
  arquivo=$(ler_campo_json "$estado" "arquivo")
  sha=$(ler_campo_json "$estado" "sha256")
  ambiente=$(ler_campo_json "$estado" "ambiente")
  ambiente_sha=$(ler_campo_json "$estado" "ambienteSha256")
  [ -n "$arquivo" ] || erro "O estado do backup não informa o arquivo."
  [ -n "$sha" ] || erro "O estado do backup não informa o checksum."

  verificar_arquivo_local "$BACKUP_BANCO_DIR/$arquivo" "$sha"
  if [ -n "$ambiente" ]; then
    [ -n "$ambiente_sha" ] || erro "O estado do backup não informa o checksum do ambiente."
    verificar_arquivo_local "$BACKUP_BANCO_DIR/$ambiente" "$ambiente_sha"
  fi

  if [ -n "${BACKUP_REMOTO:-}" ]; then
    preparar_rclone
    verificar_item_remoto "$arquivo" "$sha"
    if [ -n "$ambiente" ]; then
      verificar_item_remoto "$ambiente" "$ambiente_sha"
    fi
    log "A cópia remota confere com o hash local original."
  fi
  log "Backup confirmado: $arquivo."
}

if [ "$verificar_somente" = true ]; then
  verificar_ultimo_backup
  exit 0
fi

if [ "$BACKUP_MODO" = "compose" ]; then
  verificar_instalacao
fi

preparar_criptografia
preparar_rclone
definir_extensao

livre=$(espaco_livre_mb "$BACKUP_BANCO_DIR")
if [ "${livre:-0}" -lt "$BACKUP_ESPACO_MINIMO_MB" ]; then
  erro "Espaço insuficiente em $BACKUP_BANCO_DIR: ${livre:-0} MB livres."
fi

argumentos_dump=(
  -Fc
  --no-publications
  --no-subscriptions
  --strict-names
  --schema="$DATABASE_SCHEMA"
  --lock-wait-timeout=30s
)

gerar_dump_cifrado() {
  local destino="$1"
  local fifo="$tmp/dump.fifo"
  local pid
  local status_pipeline
  local status_validacao=false
  rm -f "$fifo"
  mkfifo "$fifo"
  chmod 600 "$fifo"

  (
    if [ "$BACKUP_MODO" = "compose" ]; then
      compose exec -T "$SERVIDOR_SERVICO_DB" pg_restore -l
    else
      pg_restore -l
    fi <"$fifo" >/dev/null
  ) &
  pid=$!

  if [ "$BACKUP_MODO" = "compose" ]; then
    if compose exec -T "$SERVIDOR_SERVICO_DB" pg_dump \
      -U "${POSTGRES_USER:-frequencia}" \
      -d "${POSTGRES_DB:-frequencia}" \
      "${argumentos_dump[@]}" | tee "$fifo" | cifrar_fluxo "$destino"; then
      status_pipeline=0
    else
      status_pipeline=$?
    fi
  else
    url_dump="${BACKUP_DATABASE_URL:-${DIRECT_URL:-}}"
    [ -n "$url_dump" ] || erro "Defina BACKUP_DATABASE_URL ou DIRECT_URL."
    log "Destino do dump: $(mascarar_url "$url_dump")"
    if pg_dump "$url_dump" "${argumentos_dump[@]}" | tee "$fifo" | cifrar_fluxo "$destino"; then
      status_pipeline=0
    else
      status_pipeline=$?
    fi
  fi

  if wait "$pid"; then
    status_validacao=true
  fi
  rm -f "$fifo"

  [ "$status_pipeline" -eq 0 ] || erro "Falha ao gerar ou cifrar o dump."
  [ "$status_validacao" = true ] || erro "O dump não passou na validação do pg_restore."
}

log "Gerando dump do schema $DATABASE_SCHEMA em modo $BACKUP_MODO, com cifra em fluxo."
base="frequenciapp-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
arquivo="$tmp/${base}.dump.${extensao}"
gerar_dump_cifrado "$arquivo"

[ -s "$arquivo" ] || erro "O arquivo cifrado saiu vazio."

sha=$(sha256sum "$arquivo" | cut -d' ' -f1)
final=("$arquivo" "$arquivo.sha256")
declare -A hashes=()
nome_arquivo=$(basename "$arquivo")
hashes["$nome_arquivo"]="$sha"
printf '%s  %s\n' "$sha" "$nome_arquivo" >"$arquivo.sha256"
hashes["$nome_arquivo.sha256"]=$(sha256sum "$arquivo.sha256" | cut -d' ' -f1)

ambiente_arquivo=""
ambiente_sha=""
if [ "$BACKUP_INCLUIR_AMBIENTE" = "true" ]; then
  [ -f "$BACKUP_AMBIENTE_ARQUIVO" ] || erro "Arquivo de ambiente não encontrado: $BACKUP_AMBIENTE_ARQUIVO."
  ambiente_arquivo="$tmp/${base}-ambiente.env.${extensao}"
  cifrar_fluxo "$ambiente_arquivo" <"$BACKUP_AMBIENTE_ARQUIVO"
  ambiente_sha=$(sha256sum "$ambiente_arquivo" | cut -d' ' -f1)
  nome_ambiente=$(basename "$ambiente_arquivo")
  hashes["$nome_ambiente"]="$ambiente_sha"
  printf '%s  %s\n' "$ambiente_sha" "$nome_ambiente" >"$ambiente_arquivo.sha256"
  hashes["$nome_ambiente.sha256"]=$(sha256sum "$ambiente_arquivo.sha256" | cut -d' ' -f1)
  final+=("$ambiente_arquivo" "$ambiente_arquivo.sha256")
fi

for item in "${final[@]}"; do
  chmod 600 "$item"
  mv "$item" "$BACKUP_BANCO_DIR/"
done

tamanho=$(stat -c '%s' "$BACKUP_BANCO_DIR/$nome_arquivo")
verificado_remoto=false

if [ -n "${BACKUP_REMOTO:-}" ]; then
  remoto="${BACKUP_REMOTO%/}"
  publicar="$tmp/publicar"
  mkdir -p "$publicar"
  for item in "${final[@]}"; do
    nome=$(basename "$item")
    cp "$BACKUP_BANCO_DIR/$nome" "$publicar/"
  done
  log "Enviando a cópia para $remoto."
  rclone_limpo copy "$publicar" "$remoto" --immutable --checksum
  if [ "$BACKUP_VERIFICAR_REMOTO" = "true" ]; then
    for item in "${final[@]}"; do
      nome=$(basename "$item")
      verificar_item_remoto "$nome" "${hashes[$nome]}"
    done
    verificado_remoto=true
    log "A cópia remota confere com os hashes locais."
  fi
fi

aplicar_retencao_local() {
  [ "$BACKUP_RETER_DIAS" -gt 0 ] || return 0
  local dumps=()
  local total
  local i
  local nome
  local prefixo
  local arquivo_antigo
  mapfile -t dumps < <(
    find "$BACKUP_BANCO_DIR" -maxdepth 1 -type f \
      \( -name 'frequenciapp-*.dump.gpg' -o -name 'frequenciapp-*.dump.age' \) \
      -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2- || true
  )
  total=${#dumps[@]}
  log "Retenção local: $total cópia(s), mínimo de $BACKUP_RETER_MINIMO."
  for ((i = BACKUP_RETER_MINIMO; i < total; i++)); do
    arquivo_antigo="${dumps[$i]}"
    if [ -z "$(find "$arquivo_antigo" -maxdepth 0 -mtime +"$BACKUP_RETER_DIAS" -print 2>/dev/null)" ]; then
      continue
    fi
    nome=$(basename "$arquivo_antigo")
    prefixo="${nome%%.dump.*}"
    log "Removendo o backup antigo $prefixo."
    if ! find "$BACKUP_BANCO_DIR" -maxdepth 1 -type f -name "$prefixo*" -delete 2>/dev/null; then
      log "Aviso: não foi possível remover o backup antigo $prefixo."
    fi
  done
}

aplicar_retencao_remota() {
  [ "$BACKUP_RETER_REMOTO" = "true" ] || return 0
  [ "$BACKUP_RETER_DIAS" -gt 0 ] || return 0
  [ -n "${BACKUP_REMOTO:-}" ] || return 0
  local nomes=()
  local total
  local i
  local nome
  local base_remota
  local data
  local epoca
  local agora
  local idade
  agora=$(date -u +%s)
  mapfile -t nomes < <(
    rclone_limpo lsf "${BACKUP_REMOTO%/}" --files-only --include 'frequenciapp-*.dump.*' 2>/dev/null |
      grep -v '\.sha256$' | sort -r || true
  )
  total=${#nomes[@]}
  for ((i = BACKUP_RETER_MINIMO; i < total; i++)); do
    nome="${nomes[$i]}"
    data="${nome#frequenciapp-}"
    data="${data%%-*}"
    case "$data" in
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
      *) continue ;;
    esac
    epoca=$(date -u -d "${data:0:4}-${data:4:2}-${data:6:2} ${data:9:2}:${data:11:2}:${data:13:2}" +%s 2>/dev/null || true)
    [ -n "$epoca" ] || continue
    idade=$((agora - epoca))
    [ "$idade" -gt $((BACKUP_RETER_DIAS * 86400)) ] || continue
    base_remota="${nome%%.dump.*}"
    rclone_limpo deletefile "${BACKUP_REMOTO%/}/$nome" >/dev/null 2>&1 || true
    rclone_limpo deletefile "${BACKUP_REMOTO%/}/$nome.sha256" >/dev/null 2>&1 || true
    rclone_limpo deletefile "${BACKUP_REMOTO%/}/${base_remota}-ambiente.env.${extensao}" >/dev/null 2>&1 || true
  done
}

mkdir -p "$ESTADO_DIR"
printf '{"em":"%s","modo":"%s","criptografia":"%s","arquivo":"%s","sha256":"%s","tamanho":%s,"schema":"%s","retencaoDias":%s,"retencaoMinima":%s,"ambiente":"%s","ambienteSha256":"%s","remoto":"%s","verificadoRemoto":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$BACKUP_MODO" \
  "$BACKUP_CRIPTOGRAFIA" \
  "$(basename "$arquivo")" \
  "$sha" \
  "$tamanho" \
  "$DATABASE_SCHEMA" \
  "$BACKUP_RETER_DIAS" \
  "$BACKUP_RETER_MINIMO" \
  "${ambiente_arquivo##*/}" \
  "$ambiente_sha" \
  "${BACKUP_REMOTO:-}" \
  "$verificado_remoto" >"$estado.tmp"
mv "$estado.tmp" "$estado"
chmod 600 "$estado"

aplicar_retencao_local
aplicar_retencao_remota

notificar sucesso "Backup do banco concluído."
log "Backup concluído: $nome_arquivo (${tamanho} bytes)."
