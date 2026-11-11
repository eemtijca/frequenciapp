#!/usr/bin/env bash
# Gera, valida, cifra e envia o dump do banco PostgreSQL.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

verificar_somente=false
diagnosticar_integridade=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar)
      verificar_somente=true
      shift
      ;;
    --diagnosticar-integridade)
      diagnosticar_integridade=true
      shift
      ;;
    --ajuda | -h)
      cat <<'TEXTO'
Uso: backup-banco.sh [--verificar]

Sem opÃ§Ãµes, gera um novo backup. Com --verificar, confere o Ãºltimo backup
local e, quando configurado, a cÃ³pia remota.
TEXTO
      exit 0
      ;;
    *)
      erro "OpÃ§Ã£o desconhecida: $1"
      ;;
  esac
done

if [ "$verificar_somente" = true ] && [ "$diagnosticar_integridade" = true ]; then
  erro "Use apenas uma das opções: --verificar ou --diagnosticar-integridade."
fi

carregar_ambiente

BACKUP_MODO="${BACKUP_MODO:-compose}"
BACKUP_CRIPTOGRAFIA="${BACKUP_CRIPTOGRAFIA:-gpg}"
BACKUP_BANCO_DIR="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
BACKUP_RETER_DIAS="${BACKUP_RETER_DIAS:-30}"
BACKUP_RETER_MINIMO="${BACKUP_RETER_MINIMO:-30}"
BACKUP_ESPACO_MINIMO_MB="${BACKUP_ESPACO_MINIMO_MB:-512}"
BACKUP_INCLUIR_AMBIENTE="${BACKUP_INCLUIR_AMBIENTE:-true}"
BACKUP_AMBIENTE_ARQUIVO="${BACKUP_AMBIENTE_ARQUIVO:-$APP_ENV_FILE}"
BACKUP_VERIFICAR_REMOTO="${BACKUP_VERIFICAR_REMOTO:-true}"
BACKUP_RETER_REMOTO="${BACKUP_RETER_REMOTO:-false}"
BACKUP_CATALOGO_PERSISTENTE="${BACKUP_CATALOGO_PERSISTENTE:-true}"
BACKUP_EXIGIR_REMOTO="${BACKUP_EXIGIR_REMOTO:-false}"
case "$BACKUP_EXIGIR_REMOTO" in true | false) ;; *) erro "BACKUP_EXIGIR_REMOTO exige true ou false." ;; esac
if [ "$BACKUP_EXIGIR_REMOTO" = true ]; then
  [ -n "${BACKUP_REMOTO:-}" ] || erro "O backup exige destino remoto efetivo."
  [ "${BACKUP_VERIFICAR_REMOTO:-true}" = true ] || erro "O remoto obrigatório exige verificação."
fi
export BACKUP_MODO BACKUP_CRIPTOGRAFIA BACKUP_RETER_DIAS BACKUP_RETER_MINIMO BACKUP_CATALOGO_PERSISTENTE BACKUP_EXIGIR_REMOTO
export ESTADO_DIR BACKUP_BANCO_DIR BACKUP_REMOTO BACKUP_RCLONE_CONFIG
DATABASE_SCHEMA="${DATABASE_SCHEMA:-public}"
export DATABASE_SCHEMA

if [ -n "${DATABASE_URL:-}${DIRECT_URL:-}${BACKUP_DATABASE_URL:-}" ]; then
  node "$DIR/validar-banco.mjs" || erro "A identidade do banco não confere."
fi

case "$BACKUP_MODO" in
  compose | url) ;;
  *) erro "BACKUP_MODO invÃ¡lido: $BACKUP_MODO. Use compose ou url." ;;
esac

case "$BACKUP_CRIPTOGRAFIA" in
  gpg | age) ;;
  *) erro "BACKUP_CRIPTOGRAFIA invÃ¡lida: $BACKUP_CRIPTOGRAFIA. Use gpg ou age." ;;
esac

case "$BACKUP_RETER_MINIMO" in
  '' | *[!0-9]*) erro "BACKUP_RETER_MINIMO deve ser um nÃºmero inteiro maior ou igual a zero." ;;
esac
case "$BACKUP_RETER_DIAS" in
  '' | *[!0-9]*) erro "BACKUP_RETER_DIAS deve ser um nÃºmero inteiro maior ou igual a zero." ;;
esac
case "$BACKUP_RETER_REMOTO" in
  true | false) ;;
  *) erro "BACKUP_RETER_REMOTO invÃ¡lido: $BACKUP_RETER_REMOTO. Use true ou false." ;;
esac

if [ "$BACKUP_MODO" = compose ]; then
  verificar_instalacao
else
  # Conservador: aliases de URL nÃ£o fornecem identidade de banco verificÃ¡vel.
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

origem_adotada=false
if [ "$BACKUP_MODO" = url ] && [ -n "${BACKUP_ORIGEM_POLICY:-}" ]; then
  origem_config=$(node "$DIR/origem-backup.mjs" validar-config) || erro "Configuração independente de origem inválida."
  IFS=$'\t' read -r SERVIDOR_ALVO_CHAVE BACKUP_BANCO_VERIFICADO <<<"$origem_config"
  export SERVIDOR_ALVO_CHAVE BACKUP_BANCO_VERIFICADO
  origem_adotada=true
fi

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
      erro "NÃ£o foi possÃ­vel importar a chave pÃºblica GPG."
    validar_destinatario_gpg
  else
    [ -f "${BACKUP_AGE_DESTINATARIOS:-}" ] || erro "Defina BACKUP_AGE_DESTINATARIOS."
    [[ "${BACKUP_AGE_DESTINATARIOS_SHA256:-}" =~ ^[a-f0-9]{64}$ ]] || erro "Defina pin independente BACKUP_AGE_DESTINATARIOS_SHA256."
    cp -- "$BACKUP_AGE_DESTINATARIOS" "$tmp/destinatarios.age"
    chmod 600 "$tmp/destinatarios.age"
    BACKUP_AGE_DESTINATARIOS="$tmp/destinatarios.age"
    BACKUP_DESTINATARIO_VERIFICADO=$(sha256sum "$BACKUP_AGE_DESTINATARIOS" | cut -d' ' -f1)
    [ "$BACKUP_DESTINATARIO_VERIFICADO" = "$BACKUP_AGE_DESTINATARIOS_SHA256" ] || erro "DestinatÃ¡rios age divergem do pin independente."
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
  # Em Kubernetes o Secret Ã© montado com dono e modo do volume. A cÃ³pia
  # privada garante a permissÃ£o 600 exigida pelo processo de transporte.
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
  [ -f "$arquivo" ] || erro "Arquivo de backup nÃ£o encontrado: $arquivo."
  calculado=$(sha256sum "$arquivo" | cut -d' ' -f1)
  [ "$calculado" = "$esperado" ] ||
    erro "O checksum local de $(basename "$arquivo") nÃ£o confere."
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
    erro "A cÃ³pia remota de $nome diverge do hash local."
}

verificar_ultimo_backup() {
  # Captura metadados uma única vez e preserva os inodes dos artefatos na
  # pasta privada. A trava é cooperativa: isto não impede escrita no mesmo
  # inode por outro processo com acesso, nem protege diretórios ancestrais.
  local captura="$tmp/captura-verificacao"
  mkdir -m 700 "$captura"
  if ! node --input-type=module - "$DIR/recibos.mjs" "$estado" "$BACKUP_BANCO_DIR" "$captura" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [modulo, ponteiro, origem, captura] = process.argv.slice(2);
const { validarRecibo } = await import(pathToFileURL(modulo).href);
function lerJsonLimitado(nome) {
  const fd = fs.openSync(nome, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try {
    const limite = 1024 * 1024;
    if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).size > limite) throw new Error('Metadado inválido.');
    const buffer = Buffer.alloc(limite + 1);
    let total = 0;
    while (total < buffer.length) {
      const n = fs.readSync(fd, buffer, total, buffer.length - total, null);
      if (!n) break;
      total += n;
    }
    if (total > limite) throw new Error('Metadado excede limite.');
    return buffer.subarray(0, total);
  } finally { fs.closeSync(fd); }
}
const estadoBytes = lerJsonLimitado(ponteiro);
const estado = JSON.parse(estadoBytes.toString('utf8'));
if (typeof estado?.recibo !== 'string' || !/^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$/.test(estado.recibo)) throw new Error('Ponteiro inválido.');
const reciboBytes = lerJsonLimitado(path.join(origem, estado.recibo));
const recibo = validarRecibo(JSON.parse(reciboBytes.toString('utf8')));
if (estado.recibo !== `${recibo.base}.confirmado.json`) throw new Error('Recibo divergente.');
fs.writeFileSync(path.join(captura, 'estado.json'), estadoBytes, { mode: 0o600, flag: 'wx' });
fs.writeFileSync(path.join(captura, estado.recibo), reciboBytes, { mode: 0o600, flag: 'wx' });
for (const item of recibo.artefatos) fs.linkSync(path.join(origem, item.nome), path.join(captura, item.nome));
const reciboHash = createHash('sha256').update(reciboBytes).digest('hex');
fs.writeFileSync(path.join(captura, 'remotos'), recibo.artefatos.map(a => `${a.nome}\t${a.sha256}\n`).join('') + `${estado.recibo}\t${reciboHash}\n`, { mode: 0o600, flag: 'wx' });
fs.writeFileSync(path.join(captura, 'nome'), `${recibo.base}.dump.${recibo.criptografia}\n`, { mode: 0o600, flag: 'wx' });
NODE
  then
    erro "Não foi possível capturar o ponteiro e o recibo com segurança."
  fi
  node "$DIR/recibos.mjs" conferir-estado "$captura" "$captura/estado.json" || erro "Recibo, escopo ou artefatos inválidos."
  if [ -n "${BACKUP_REMOTO:-}" ]; then
    preparar_rclone
    local item item_sha
    while IFS=$'\t' read -r item item_sha; do
      verificar_item_remoto "$item" "$item_sha"
    done <"$captura/remotos"
    log "Todos os artefatos e o recibo remoto conferem com os hashes locais."
  fi
  local arquivo
  IFS= read -r arquivo <"$captura/nome"
  log "Backup confirmado: $arquivo."
}

if [ "$diagnosticar_integridade" = true ]; then
  [ -f "$estado" ] || erro "Não há estado de backup em $estado."
  node "$DIR/recibos.mjs" diagnosticar-integridade "$BACKUP_BANCO_DIR" "$estado" ||
    erro "Recibo ou artefatos locais inválidos."
  log "Integridade local conferida; origem do backup não comprovada. Não autoriza atualização ou retenção."
  exit 0
fi

if [ "$BACKUP_MODO" = "compose" ]; then
  conferir_banco_compose
fi

if [ "$verificar_somente" = false ] && [ -n "${BACKUP_DROPBOX_CONFIG:-}" ]; then
  [ "$BACKUP_MODO" = compose ] || erro "Escrita Dropbox adotada suspensa no perfil URL."
  if [ -n "${BACKUP_DROPBOX_SESSAO:-}" ]; then
    node "$DIR/dropbox-autoridade.mjs" conferir || erro "Handoff Dropbox inválido."
  else
    # O pai mantém o FD 9; o wrapper mantém a autoridade até terminar o filho.
    node "$DIR/dropbox-autoridade.mjs" executar
    exit "$?"
  fi
fi

if [ "$verificar_somente" = true ]; then
  if [ "$BACKUP_MODO" = url ]; then
    [ "$origem_adotada" = true ] || erro "Origem URL legada não adotada; use diagnóstico separado."
    node "$DIR/origem-backup.mjs" verificar || erro "Origem autenticada ou artefatos divergentes."
  fi
  verificar_ultimo_backup
  exit 0
fi

preparar_criptografia
preparar_rclone
definir_extensao

livre=$(espaco_livre_mb "$BACKUP_BANCO_DIR")
if [ "${livre:-0}" -lt "$BACKUP_ESPACO_MINIMO_MB" ]; then
  erro "EspaÃ§o insuficiente em $BACKUP_BANCO_DIR: ${livre:-0} MB livres."
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
  # Abre leitura e escrita no mesmo descritor para o leitor nÃ£o bloquear
  # esperando o primeiro escritor e para o fechamento ser explÃ­cito.
  exec 8<>"$fifo"

  (
    exec 8>&-
    if [ "$BACKUP_MODO" = "compose" ]; then
      compose exec -T "$SERVIDOR_SERVICO_DB" pg_restore -l
    else
      pg_restore -l
    fi
  ) <"$fifo" >/dev/null &
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
    if [ "$origem_adotada" = true ]; then
      if node "$DIR/origem-backup.mjs" dump "$tmp/origem.json" | tee "$fifo" | cifrar_fluxo "$destino"; then
        status_pipeline=0
      else
        status_pipeline=$?
      fi
    elif pg_dump "$url_dump" "${argumentos_dump[@]}" | tee "$fifo" | cifrar_fluxo "$destino"; then
      status_pipeline=0
    else
      status_pipeline=$?
    fi
  fi

  exec 8>&-
  if wait "$pid"; then
    status_validacao=true
  fi
  rm -f "$fifo"

  [ "$status_pipeline" -eq 0 ] || erro "Falha ao gerar ou cifrar o dump."
  [ "$status_validacao" = true ] || erro "O dump nÃ£o passou na validaÃ§Ã£o do pg_restore."
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
  [ -f "$BACKUP_AMBIENTE_ARQUIVO" ] || erro "Arquivo de ambiente nÃ£o encontrado: $BACKUP_AMBIENTE_ARQUIVO."
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
  log "Enviando a cÃ³pia para $remoto."
  rclone_limpo copy "$publicar" "$remoto" --immutable --checksum
  if [ "$BACKUP_VERIFICAR_REMOTO" = "true" ]; then
    for item in "${final[@]}"; do
      nome=$(basename "$item")
      verificar_item_remoto "$nome" "${hashes[$nome]}"
    done
    verificado_remoto=true
    log "A cÃ³pia remota confere com os hashes locais."
  fi
fi

aplicar_retencao_local() {
  if [ "$BACKUP_MODO" = url ]; then
    log "RetenÃ§Ã£o local conservadora: identidade do banco URL nÃ£o demonstrada; nenhum expurgo."
    return 0
  fi
  node "$DIR/recibos.mjs" planejar-local "$BACKUP_BANCO_DIR" >"$tmp/plano-local" || erro "Plano local invÃ¡lido."
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
    log "Expurgo remoto suspenso: catÃ¡logo persistente e identidade do alvo precisam ser demonstrados."
    return 0
  fi
  RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG" node "$DIR/backup-recibos.mjs" expurgar-remoto \
    "$ESTADO_DIR/recibos" "$ESTADO_DIR/expurgos" ||
    erro "Expurgo remoto parcial ou nÃ£o comprovado; catÃ¡logo e registro preservados."
}

# O catÃ¡logo independente nÃ£o Ã© baixado do provedor e sobrevive ao expurgo local.
recibo="${base}.confirmado.json"
RECIBO_REMOTO_VERIFICADO="$verificado_remoto" node "$DIR/recibos.mjs" criar "$BACKUP_BANCO_DIR" "$base" >"$tmp/$recibo" ||
  erro "NÃ£o foi possÃ­vel confirmar o conjunto."
if [ "$origem_adotada" = true ]; then
  node "$DIR/origem-backup.mjs" assinar "$tmp/$recibo" "$tmp/origem.json" >"$tmp/$recibo.assinado" || erro "Atestação de origem falhou."
  mv "$tmp/$recibo.assinado" "$tmp/$recibo"
fi
if [ -n "${BACKUP_REMOTO:-}" ]; then
  rclone_limpo copyto "$tmp/$recibo" "${BACKUP_REMOTO%/}/$recibo" || erro "PublicaÃ§Ã£o remota do recibo falhou."
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

if [ -n "${BACKUP_DROPBOX_CONFIG:-}" ]; then
  node "$DIR/dropbox-autoridade.mjs" publicar "$recibo" || erro "Publicação Dropbox não durável; expurgo suspenso."
fi

aplicar_retencao_remota
aplicar_retencao_local

notificar sucesso "Backup do banco concluÃ­do."
log "Backup concluÃ­do: $nome_arquivo (${tamanho} bytes)."
