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
BACKUP_CATALOGO_PERSISTENTE="${BACKUP_CATALOGO_PERSISTENTE:-true}"
export BACKUP_MODO BACKUP_CRIPTOGRAFIA BACKUP_RETER_DIAS BACKUP_RETER_MINIMO BACKUP_CATALOGO_PERSISTENTE
DATABASE_SCHEMA="${DATABASE_SCHEMA:-public}"
export DATABASE_SCHEMA

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

if [ "$BACKUP_MODO" = compose ]; then
  verificar_instalacao
else
  # Conservador: aliases de URL não fornecem identidade de banco verificável.
  SERVIDOR_ALVO_CHAVE=url-conservador
fi
export SERVIDOR_ALVO_CHAVE
travar backup-banco 0
unset BACKUP_BANCO_VERIFICADO
estado="$ESTADO_DIR/ultimo-backup.json"

mkdir -p "$BACKUP_BANCO_DIR"
chmod 700 "$BACKUP_BANCO_DIR" 2>/dev/null || true
mkdir -p "$ESTADO_DIR"
chmod 700 "$ESTADO_DIR" 2>/dev/null || true

tmp=$(mktemp -d "$BACKUP_BANCO_DIR/.tmp.XXXXXX")
trap 'status=$?; limpar_home_gpg; if [ "$status" -ne 0 ]; then notificar falha "Backup do banco falhou."; fi; rm -rf "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
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
    iniciar_home_gpg
    gpg --batch --import "$BACKUP_GPG_CHAVE_PUBLICA" >/dev/null ||
      erro "Não foi possível importar a chave pública GPG."
    validar_destinatario_gpg
  else
    [ -f "${BACKUP_AGE_DESTINATARIOS:-}" ] || erro "Defina BACKUP_AGE_DESTINATARIOS."
    [[ "${BACKUP_AGE_DESTINATARIOS_SHA256:-}" =~ ^[a-f0-9]{64}$ ]] || erro "Defina pin independente BACKUP_AGE_DESTINATARIOS_SHA256."
    cp -- "$BACKUP_AGE_DESTINATARIOS" "$tmp/destinatarios.age"
    chmod 600 "$tmp/destinatarios.age"
    BACKUP_AGE_DESTINATARIOS="$tmp/destinatarios.age"
    BACKUP_DESTINATARIO_VERIFICADO=$(sha256sum "$BACKUP_AGE_DESTINATARIOS" | cut -d' ' -f1)
    [ "$BACKUP_DESTINATARIO_VERIFICADO" = "$BACKUP_AGE_DESTINATARIOS_SHA256" ] || erro "Destinatários age divergem do pin independente."
    export BACKUP_DESTINATARIO_VERIFICADO
  fi
}

cifrar_fluxo() {
  local destino="$1"
  case "$BACKUP_CRIPTOGRAFIA" in
    gpg)
      gpg --batch --yes --trust-model always \
        --recipient "${BACKUP_DESTINATARIO_VERIFICADO}!" \
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
  local recibo
  recibo=$(ler_campo_json "$estado" recibo)
  [[ "$recibo" =~ ^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$ ]] || erro "Backup legado exige adoção/verificação explícita."
  node "$DIR/recibos.mjs" conferir-estado "$BACKUP_BANCO_DIR" "$estado" || erro "Recibo, escopo ou artefatos inválidos."
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
  conferir_banco_compose
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
  if [ "$BACKUP_MODO" = url ]; then
    log "Retenção local conservadora: identidade do banco URL não demonstrada; nenhum expurgo."
    return 0
  fi
  node "$DIR/recibos.mjs" planejar-local "$BACKUP_BANCO_DIR" >"$tmp/plano-local" || erro "Plano local inválido."
  local conjunto nome
  while IFS=$'\t' read -r conjunto nome; do
    [ -n "$nome" ] || continue
    rm -- "$BACKUP_BANCO_DIR/$nome" || erro "Expurgo local parcial; preservar recibo e revisar o conjunto $conjunto."
  done <"$tmp/plano-local"
}

aplicar_retencao_remota() {
  [ "$BACKUP_RETER_REMOTO" = true ] || return 0
  [ -n "${BACKUP_REMOTO:-}" ] || return 0
  if [ "$BACKUP_CATALOGO_PERSISTENTE" != true ] || [ "$BACKUP_MODO" = url ]; then
    log "Expurgo remoto suspenso: catálogo persistente e identidade do alvo precisam ser demonstrados."
    return 0
  fi
  RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG" node "$DIR/backup-recibos.mjs" expurgar-remoto \
    "$ESTADO_DIR/recibos" "$ESTADO_DIR/expurgos" ||
    erro "Expurgo remoto parcial ou não comprovado; catálogo e registro preservados."
}

# O catálogo independente não é baixado do provedor e sobrevive ao expurgo local.
recibo="${base}.confirmado.json"
RECIBO_REMOTO_VERIFICADO="$verificado_remoto" node "$DIR/recibos.mjs" criar "$BACKUP_BANCO_DIR" "$base" >"$tmp/$recibo" ||
  erro "Não foi possível confirmar o conjunto."
if [ -n "${BACKUP_REMOTO:-}" ]; then
  rclone_limpo copyto "$tmp/$recibo" "${BACKUP_REMOTO%/}/$recibo" || erro "Publicação remota do recibo falhou."
  verificar_item_remoto "$recibo" "$(sha256sum "$tmp/$recibo" | cut -d' ' -f1)"
fi
mkdir -p "$ESTADO_DIR/recibos"
chmod 700 "$ESTADO_DIR/recibos"
cp "$tmp/$recibo" "$ESTADO_DIR/recibos/$recibo.tmp"
chmod 600 "$ESTADO_DIR/recibos/$recibo.tmp"
mv "$ESTADO_DIR/recibos/$recibo.tmp" "$ESTADO_DIR/recibos/$recibo"
cp "$tmp/$recibo" "$BACKUP_BANCO_DIR/$recibo.tmp"
chmod 600 "$BACKUP_BANCO_DIR/$recibo.tmp"
mv "$BACKUP_BANCO_DIR/$recibo.tmp" "$BACKUP_BANCO_DIR/$recibo"
node --input-type=module - "$tmp/$recibo" "$BACKUP_MODO" <<'NODE' >"$estado.tmp"
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const arquivo = r.artefatos.find(a => a.nome.includes('.dump.') && !a.nome.endsWith('.sha256'));
const ambiente = r.artefatos.find(a => a.nome.includes('-ambiente.env.') && !a.nome.endsWith('.sha256'));
process.stdout.write(JSON.stringify({em:r.em,modo:process.argv[3],criptografia:r.criptografia,arquivo:arquivo.nome,sha256:arquivo.sha256,schema:r.escopo.schema,ambiente:ambiente?.nome??'',ambienteSha256:ambiente?.sha256??'',remoto:r.remoto,verificadoRemoto:r.etapas.remotoVerificado,recibo:r.base+'.confirmado.json'})+'\n');
NODE
chmod 600 "$estado.tmp"
mv "$estado.tmp" "$estado"

aplicar_retencao_remota
aplicar_retencao_local

notificar sucesso "Backup do banco concluído."
log "Backup concluído: $nome_arquivo (${tamanho} bytes)."
