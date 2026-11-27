#!/usr/bin/env bash
# Gera, valida, cifra e envia o dump do banco PostgreSQL.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

verificar_somente=false
sem_escrita=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar)
      verificar_somente=true
      shift
      ;;
    --sem-escrita)
      sem_escrita=true
      shift
      ;;
    --ajuda | -h)
      cat <<'TEXTO'
Uso: backup-banco.sh [--verificar [--sem-escrita]]

Sem opções, gera um novo backup. Com --verificar, confere o último backup
local e, quando configurado, a cópia remota. --sem-escrita exige --verificar
e faz a conferência sem adquirir trava nem criar diretórios ou temporários
na instalação.
TEXTO
      exit 0
      ;;
    *)
      erro "Opção desconhecida: $1"
      ;;
  esac
done

if [ "$sem_escrita" = true ] && [ "$verificar_somente" != true ]; then
  erro "--sem-escrita exige --verificar."
fi

# A expectativa vem do atualizador, não dos arquivos de ambiente nem do recibo.
readonly pre_migracao="${BACKUP_MIGRACOES_AUTO_ESPERADO+x}"
readonly operacao_manual_backup="${BACKUP_MIGRACAO_MANUAL_OPERACAO:-}"
readonly inicio_manual_backup="${BACKUP_MIGRACAO_MANUAL_INICIO:-}"
readonly trava_manual_backup="${SERVIDOR_LOCK_HERDADO:-}"
readonly banco_pre_migracao_esperado="${BACKUP_MIGRACOES_AUTO_ESPERADO:-}"
carregar_ambiente
unset BACKUP_MIGRACOES_AUTO_ESPERADO BACKUP_MIGRACAO_MANUAL_OPERACAO BACKUP_MIGRACAO_MANUAL_INICIO
[ -z "$operacao_manual_backup" ] || [ -n "$pre_migracao" ] || erro "Backup manual sem expectativa de origem."

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
BACKUP_EXIGIR_REMOTO="${BACKUP_EXIGIR_REMOTO:-false}"
BACKUP_TIMEOUT_DUMP_SEGUNDOS="${BACKUP_TIMEOUT_DUMP_SEGUNDOS:-3600}"
[[ "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" =~ ^[1-9][0-9]{0,4}$ ]] &&
  [ "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" -le 86400 ] ||
  erro "BACKUP_TIMEOUT_DUMP_SEGUNDOS deve estar entre 1 e 86400."
export BACKUP_TIMEOUT_DUMP_SEGUNDOS
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

if [ -n "$pre_migracao" ]; then
  [ "$BACKUP_MODO" = compose ] && [ "$verificar_somente" = false ] ||
    erro "Backup pré-migração exige geração em modo Compose."
  if [ -n "$operacao_manual_backup" ]; then
    [ -n "$trava_manual_backup" ] && [ "${SERVIDOR_LOCK_HERDADO:-}" = "$trava_manual_backup" ] &&
      [ -z "${SERVIDOR_CONTROLADOR_PERFIL:-}${SERVIDOR_CONTROLADOR_OPERACAO:-}" ] ||
      erro "Backup pré-migração manual exige a trava herdada do atualizador no perfil simples."
    operacao_backup="$operacao_manual_backup"
    export BACKUP_MIGRACAO_MANUAL_OPERACAO="$operacao_manual_backup" BACKUP_MIGRACAO_MANUAL_INICIO="$inicio_manual_backup"
  else
    [ "$(id -u)" = 0 ] && [ "${SERVIDOR_CONTROLADOR_ACAO:-}" = atualizar ] &&
      [ -n "${SERVIDOR_CONTROLADOR_PERFIL:-}" ] ||
      erro "Backup pré-migração exige operação Compose ativa do controlador."
    operacao_backup="${SERVIDOR_CONTROLADOR_OPERACAO:-}"
  fi
  [[ "$operacao_backup" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]] ||
    erro "Identificador da operação de backup pré-migração inválido."
  node "$DIR/recibos.mjs" banco-pre-migracao "$banco_pre_migracao_esperado" >/dev/null ||
    erro "Identidade esperada do banco pré-migração inválida."
  # O pai Dropbox relança este mesmo produtor sob a autoridade de transporte.
  export BACKUP_MIGRACOES_AUTO_ESPERADO="$banco_pre_migracao_esperado"
fi

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
  if [ "$sem_escrita" = true ]; then
    export SERVIDOR_IDENTIDADE_SEM_ARQUIVOS=true
  else
    unset SERVIDOR_IDENTIDADE_SEM_ARQUIVOS
  fi
  verificar_instalacao
else
  unset SERVIDOR_IDENTIDADE_SEM_ARQUIVOS
  # Conservador: aliases de URL não comprovam identidade física do servidor.
  SERVIDOR_ALVO_CHAVE=url-conservador
fi
export SERVIDOR_ALVO_CHAVE
unset BACKUP_BANCO_VERIFICADO
estado="$ESTADO_DIR/ultimo-backup.json"

if [ "$sem_escrita" = false ]; then
  travar backup-banco 0
  mkdir -p "$BACKUP_BANCO_DIR"
  chmod 700 "$BACKUP_BANCO_DIR" 2>/dev/null || true
  mkdir -p "$ESTADO_DIR"
  chmod 700 "$ESTADO_DIR" 2>/dev/null || true
  tmp=$(mktemp -d "$BACKUP_BANCO_DIR/.tmp.XXXXXX")
else
  tmp=""
fi

if [ "$sem_escrita" = true ]; then
  export BACKUP_POSTGRES_SEM_ARQUIVO=true
else
  unset BACKUP_POSTGRES_SEM_ARQUIVO
fi

trap 'status=$?; limpar_home_gpg; if [ "$status" -ne 0 ] && [ "$sem_escrita" = false ]; then notificar falha "Backup do banco falhou."; fi; [ -z "$tmp" ] || rm -rf "$tmp"' EXIT
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
      timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" gpg --batch --yes --trust-model always \
        --recipient "${BACKUP_DESTINATARIO_VERIFICADO}!" \
        --output "$destino" --encrypt
      ;;
    age)
      timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" age --recipients-file "$BACKUP_AGE_DESTINATARIOS" \
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
    erro "A cópia remota de $nome diverge do hash local."
}

verificar_item_remoto_leitura() {
  local nome="$1"
  local esperado="$2"
  local calculado
  calculado=$(rclone_limpo cat "${BACKUP_REMOTO%/}/$nome" | sha256sum | cut -d' ' -f1) ||
    erro "Não foi possível ler $nome do destino remoto."
  [ "$calculado" = "$esperado" ] ||
    erro "A cópia remota de $nome diverge do hash local."
}

verificar_ultimo_backup() {
  [ -f "$estado" ] || erro "NÃ£o hÃ¡ estado de backup em $estado."
  local recibo
  recibo=$(ler_campo_json "$estado" recibo)
  [[ "$recibo" =~ ^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$ ]] || erro "Backup legado exige adoÃ§Ã£o/verificaÃ§Ã£o explÃ­cita."
  node "$DIR/recibos.mjs" conferir-estado "$BACKUP_BANCO_DIR" "$estado" || erro "Recibo, escopo ou artefatos invÃ¡lidos."
  local arquivo
  local sha
  local ambiente
  local ambiente_sha
  arquivo=$(ler_campo_json "$estado" "arquivo")
  sha=$(ler_campo_json "$estado" "sha256")
  ambiente=$(ler_campo_json "$estado" "ambiente")
  ambiente_sha=$(ler_campo_json "$estado" "ambienteSha256")
  [ -n "$arquivo" ] || erro "O estado do backup nÃ£o informa o arquivo."
  [ -n "$sha" ] || erro "O estado do backup nÃ£o informa o checksum."

  verificar_arquivo_local "$BACKUP_BANCO_DIR/$arquivo" "$sha"
  if [ -n "$ambiente" ]; then
    [ -n "$ambiente_sha" ] || erro "O estado do backup nÃ£o informa o checksum do ambiente."
    verificar_arquivo_local "$BACKUP_BANCO_DIR/$ambiente" "$ambiente_sha"
  fi

  if [ -n "${BACKUP_REMOTO:-}" ]; then
    if [ "$sem_escrita" = true ]; then
      # O transporte pode renovar o OAuth mesmo em uma leitura. A cópia
      # descartável protege o arquivo adotado e não vive na instalação.
      tmp=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-verificar-backup.XXXXXXXX") ||
        erro "Não foi possível criar a cópia descartável da configuração remota."
    fi
    preparar_rclone
    # O escopo já foi conferido contra o alvo; todos os membros precisam conferir hoje.
    local lista_remota
    lista_remota=$(node --input-type=module - "$BACKUP_BANCO_DIR/$recibo" <<'NODE'
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const a of r.artefatos) process.stdout.write(`${a.nome}\t${a.sha256}\n`);
NODE
    ) || erro "Não foi possível ler os artefatos do recibo remoto."
    local nome hash_remoto
    while IFS=$'\t' read -r nome hash_remoto; do
      [ -n "$nome" ] || continue
      if [ "$sem_escrita" = true ]; then
        verificar_item_remoto_leitura "$nome" "$hash_remoto"
      else
        verificar_item_remoto "$nome" "$hash_remoto"
      fi
    done <<<"$lista_remota"
    if [ "$sem_escrita" = true ]; then
      verificar_item_remoto_leitura "$recibo" "$(sha256sum "$BACKUP_BANCO_DIR/$recibo" | cut -d' ' -f1)"
    else
      verificar_item_remoto "$recibo" "$(sha256sum "$BACKUP_BANCO_DIR/$recibo" | cut -d' ' -f1)"
    fi
    log "A cópia remota confere com o hash local original."
  fi
  if [ "$sem_escrita" = false ]; then
    publicar_metrica_ultimo_backup "$(ler_instante_backup)"
  fi
  log "Backup confirmado: $arquivo."
}

ler_instante_backup() {
  node --input-type=module - "$estado" 2>/dev/null <<'NODE' || true
import fs from 'node:fs';
try {
  const estado = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(typeof estado.em === 'string' ? estado.em : '');
} catch {}
NODE
}

publicar_metrica_ultimo_backup() {
  local instante="${1:-}"
  if [ -z "$instante" ]; then
    log "AVISO: o último backup não informa o instante; idade do backup não publicada."
    return 0
  fi
  local epoch
  if ! epoch=$(date -u -d "$instante" +%s 2>/dev/null) || ! [[ "$epoch" =~ ^[0-9]+$ ]]; then
    log "AVISO: o instante do último backup é inválido; idade do backup não publicada."
    return 0
  fi
  local diretorio="$ESTADO_DIR/metricas"
  local destino="$diretorio/ultimo-backup.prom"
  local temporario
  if ! mkdir -p "$diretorio" 2>/dev/null || ! chmod 755 "$diretorio" 2>/dev/null; then
    log "AVISO: não foi possível preparar o diretório de métricas; idade do backup não publicada."
    return 0
  fi
  if ! temporario=$(mktemp "$diretorio/.ultimo-backup.XXXXXX" 2>/dev/null); then
    log "AVISO: não foi possível criar o temporário da métrica de idade do backup."
    return 0
  fi
  if ! printf '%s\n' \
    '# HELP frequenciapp_backup_ultimo_sucesso_timestamp_seconds Momento do último backup verificado.' \
    '# TYPE frequenciapp_backup_ultimo_sucesso_timestamp_seconds gauge' \
    "frequenciapp_backup_ultimo_sucesso_timestamp_seconds $epoch" >"$temporario" 2>/dev/null ||
    ! chmod 644 "$temporario" 2>/dev/null ||
    ! mv -f "$temporario" "$destino" 2>/dev/null; then
    rm -f -- "$temporario" 2>/dev/null || true
    log "AVISO: não foi possível publicar a métrica de idade do backup."
    return 0
  fi
}

executar_postgres_url() {
  # A conexão privada é comum à consulta e ao dump; nenhuma URL vai para argv.
  local arquivo_pgservice="$tmp/conexao.pgservice"
  if [ "$sem_escrita" = true ]; then
    arquivo_pgservice=""
  fi
  node --input-type=module - "$arquivo_pgservice" "$@" <<'NODE'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
try {
  const [arquivo, comando, ...args] = process.argv.slice(2);
  if (!['psql', 'pg_dump'].includes(comando)) throw new Error();
  const u = new URL(process.env.BACKUP_DATABASE_URL || process.env.DIRECT_URL || '');
  const campos = new Map([
    ['host', decodeURIComponent(u.hostname.replace(/^\[|\]$/g, ''))],
    ['port', u.port || '5432'], ['dbname', decodeURIComponent(u.pathname.slice(1))],
  ]);
  if (u.username) campos.set('user', decodeURIComponent(u.username));
  if (u.password) campos.set('password', decodeURIComponent(u.password));
  // libpq trata + literalmente; URLSearchParams segue form-urlencoded.
  u.search = u.search.replaceAll('+', '%2B');
  for (const [chave, valor] of u.searchParams) {
    if (chave === 'schema') continue;
    // Compatibilidade JDBC da URI libpq, não aceita como chave pgservice.
    if (chave === 'ssl' && valor === 'true') campos.set('sslmode', 'require');
    else campos.set(chave, valor);
  }
  const senha = campos.get('password');
  campos.delete('password');
  for (const [chave, valor] of campos) {
    if (!/^[a-z_]+$/.test(chave) || /[\r\n\0]/.test(valor) || valor !== valor.trimEnd()) throw new Error();
  }
  let env;
  if (process.env.BACKUP_POSTGRES_SEM_ARQUIVO === 'true') {
    // Leitura sem arquivo: parâmetros conhecidos passam pelo ambiente do libpq.
    const mapa = new Map([
      ['host', 'PGHOST'], ['port', 'PGPORT'], ['dbname', 'PGDATABASE'], ['user', 'PGUSER'],
      ['sslmode', 'PGSSLMODE'], ['application_name', 'PGAPPNAME'],
      ['connect_timeout', 'PGCONNECT_TIMEOUT'], ['options', 'PGOPTIONS'],
      ['target_session_attrs', 'PGTARGETSESSIONATTRS'],
    ]);
    env = { PATH: process.env.PATH, HOME: process.env.HOME };
    for (const [chave, valor] of campos) {
      const destino = mapa.get(chave);
      if (!destino) throw new Error();
      env[destino] = valor;
    }
    if (senha !== undefined) env.PGPASSWORD = senha;
  } else {
    // password fica no ambiente para preservar inclusive espaços nas extremidades.
    const texto = '[backup]\n' + [...campos].map(([k, v]) => `${k}=${v}\n`).join('');
    fs.writeFileSync(arquivo, texto, { mode: 0o600 });
    env = { PATH: process.env.PATH, HOME: process.env.HOME, PGSERVICEFILE: arquivo, PGSERVICE: 'backup' };
    if (senha !== undefined) env.PGPASSWORD = senha;
  }
  const prazo = comando === 'pg_dump'
    ? { timeout: Number(process.env.BACKUP_TIMEOUT_DUMP_SEGUNDOS) * 1000, killSignal: 'SIGKILL' }
    : {};
  const r = spawnSync(comando, args, { env, stdio: ['ignore', 'inherit', 'pipe'], ...prazo });
  if (r.error || r.signal || r.status !== 0) throw new Error();
} catch {
  console.error('[banco] Não foi possível executar o cliente PostgreSQL com a conexão configurada.');
  process.exitCode = 1;
}
NODE
}

observar_banco_pre_migracao() {
  local container iniciado sonda
  container=$(timeout -k 3 15 "${COMPOSE[@]}" ps -q --no-trunc "$SERVIDOR_SERVICO_DB") || return 1
  [ "$container" = "$container_pre_migracao" ] || return 1
  iniciado=$(timeout -k 3 15 docker inspect "$container" | jq -ers \
    --arg id "$container" --arg projeto "$COMPOSE_PROJECT_NAME" --arg servico "$SERVIDOR_SERVICO_DB" '
    select(length == 1 and (.[0] | type == "array" and length == 1)) | .[0][0] |
    select(.Id == $id and .State.Running == true and
      .Config.Labels["com.docker.compose.project"] == $projeto and
      .Config.Labels["com.docker.compose.service"] == $servico) |
    .State.StartedAt | select(type == "string" and length > 0)
  ') || return 1
  # PSQL e pg_dump usam o mesmo ID, socket local, porta, usuário e banco.
  sonda=$(timeout -k 3 15 "${exec_pre_migracao[@]}" psql -XwqAt "${conexao_pre_migracao[@]}" \
    -v ON_ERROR_STOP=1 -v "schema=$DATABASE_SCHEMA" -v "usuario=${POSTGRES_USER:-frequencia}" -f - 2>/dev/null <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL search_path = pg_catalog;
SELECT json_build_object(
  'cluster', (SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
  'banco', current_database(), 'bancoOid', d.oid::text,
  'schema', n.nspname, 'schemaOid', n.oid::text,
  'primario', NOT pg_is_in_recovery(), 'inicio', EXTRACT(epoch FROM pg_postmaster_start_time())::text
)
FROM pg_catalog.pg_database d CROSS JOIN pg_catalog.pg_namespace n
WHERE d.datname = current_database() AND n.nspname = :'schema'
  AND inet_server_addr() IS NULL AND current_user = :'usuario';
ROLLBACK;
SQL
  ) || return 1
  jq -cesS --arg container "$container" --arg iniciado "$iniciado" \
    --argjson esperado "$banco_pre_migracao_esperado" '
    select(length == 1) | .[0] | . + {container:$container} |
    select(.primario == true and (.inicio | type == "string" and length > 0) and
      (del(.inicio,.primario) == $esperado)) | . + {inicioContainer:$iniciado}
  ' <<<"$sonda"
}

if [ "$BACKUP_MODO" = "compose" ]; then
  if [ -n "$pre_migracao" ]; then
    container_pre_migracao=$(jq -er '.container' <<<"$banco_pre_migracao_esperado")
    banco_esperado=$(jq -er '.banco' <<<"$banco_pre_migracao_esperado")
    [ "$banco_esperado" = "${POSTGRES_DB:-frequencia}" ] &&
      [ "$(jq -er '.schema' <<<"$banco_pre_migracao_esperado")" = "$DATABASE_SCHEMA" ] ||
      erro "Banco ou schema pré-migração diverge do ambiente."
    exec_pre_migracao=(docker exec -i "$container_pre_migracao" /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin)
    conexao_pre_migracao=(-h /var/run/postgresql -p 5432 -U "${POSTGRES_USER:-frequencia}" -d "$banco_esperado")
    # O transporte precisa conhecer o banco antes de relançar o produtor.
    if [ -n "${BACKUP_DROPBOX_CONFIG:-}" ]; then
      observar_banco_pre_migracao >/dev/null || erro "Origem pré-migração não comprovada."
      export BACKUP_BANCO_VERIFICADO="$banco_esperado"
    fi
  else
    conferir_banco_compose
  fi
else
  banco_esperado=$(node --input-type=module - "$DIR/validar-banco.mjs" <<'NODE'
const { validarIdentidadeBanco } = await import(process.argv[2]);
process.stdout.write(validarIdentidadeBanco().database);
NODE
  ) || erro "Não foi possível resolver o banco solicitado."
  banco_observado=$(executar_postgres_url psql -X -v ON_ERROR_STOP=1 -tAc 'SELECT current_database();') ||
    erro "Não foi possível comprovar o banco selecionado."
  [ "$banco_observado" = "$banco_esperado" ] || erro "Banco efetivo diverge do banco solicitado."
  cluster_observado=$(executar_postgres_url psql -X -v ON_ERROR_STOP=1 -tAc 'SELECT system_identifier::text FROM pg_control_system();') ||
    erro "Não foi possível comprovar a identidade do cluster PostgreSQL; conferir acesso de leitura e conexão."
  [[ "$cluster_observado" =~ ^[1-9][0-9]{0,19}$ ]] ||
    erro "Não foi possível comprovar a identidade do cluster PostgreSQL."
  # A trava URL continua global/conservadora; o recibo distingue clusters nativos.
  export SERVIDOR_ALVO_CHAVE="url-cluster-$cluster_observado"
  export BACKUP_BANCO_VERIFICADO="$banco_observado"
fi

if [ -n "${BACKUP_DROPBOX_CONFIG:-}" ]; then
  node --input-type=module - "$DIR/dropbox-estado.mjs" <<'NODE' || exit 1
const { verificarCapacidadeRclone } = await import(process.argv[2]);
try { verificarCapacidadeRclone(); }
catch (erro) { console.error(`[dropbox] ${erro.message}`); process.exitCode = 1; }
NODE
fi

if [ "$verificar_somente" = true ]; then
  verificar_ultimo_backup
  exit 0
fi

if [ "$verificar_somente" = false ] && [ -n "${BACKUP_DROPBOX_CONFIG:-}" ]; then
  [ "$BACKUP_MODO" = compose ] || erro "A escrita Dropbox adotada exige o modo compose."
  if [ -n "${BACKUP_DROPBOX_SESSAO:-}" ]; then
    node "$DIR/dropbox-autoridade.mjs" conferir || erro "Handoff Dropbox inválido."
  else
    # O pai mantém a autoridade durante o upload rclone inteiro.
    node "$DIR/dropbox-autoridade.mjs" executar
    exit "$?"
  fi
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
    status=0
    if [ -n "$pre_migracao" ]; then
      timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" "${exec_pre_migracao[@]}" pg_restore -l || status=$?
    elif [ "$BACKUP_MODO" = "compose" ]; then
      timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" "${COMPOSE[@]}" exec -T "$SERVIDOR_SERVICO_DB" pg_restore -l || status=$?
    else
      timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" pg_restore -l || status=$?
    fi
    # A listagem termina no catálogo. Continue lendo até EOF, mesmo se ela falhar.
    cat || exit 1
    exit "$status"
  ) <"$fifo" >/dev/null &
  pid=$!

  if [ -n "$pre_migracao" ]; then
    if timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" "${exec_pre_migracao[@]}" pg_dump \
      -w "${conexao_pre_migracao[@]}" "${argumentos_dump[@]}" 8>&- | timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" tee "$fifo" 8>&- | cifrar_fluxo "$destino" 8>&-; then
      status_pipeline=0
    else
      status_pipeline=$?
    fi
  elif [ "$BACKUP_MODO" = "compose" ]; then
    if timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" "${COMPOSE[@]}" exec -T "$SERVIDOR_SERVICO_DB" pg_dump \
      -U "${POSTGRES_USER:-frequencia}" \
      -d "${POSTGRES_DB:-frequencia}" \
      "${argumentos_dump[@]}" 8>&- | timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" tee "$fifo" 8>&- | cifrar_fluxo "$destino" 8>&-; then
      status_pipeline=0
    else
      status_pipeline=$?
    fi
  else
    if executar_postgres_url pg_dump "${argumentos_dump[@]}" 8>&- | timeout -k 10 "$BACKUP_TIMEOUT_DUMP_SEGUNDOS" tee "$fifo" 8>&- | cifrar_fluxo "$destino" 8>&-; then
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
if [ -n "$pre_migracao" ]; then
  origem_antes=$(observar_banco_pre_migracao) || erro "Origem pré-migração não comprovada antes do dump."
  if [ -n "$operacao_manual_backup" ]; then
    jq -e --argjson inicio "$inicio_manual_backup" '{inicio,inicioContainer} == $inicio' <<<"$origem_antes" >/dev/null ||
      erro "Origem pré-migração manual reiniciou antes do dump."
  fi
fi
gerar_dump_cifrado "$arquivo"
if [ -n "$pre_migracao" ]; then
  origem_depois=$(observar_banco_pre_migracao) || erro "Origem pré-migração não comprovada depois do dump."
  [ "$origem_antes" = "$origem_depois" ] || erro "Origem pré-migração mudou durante o dump."
  origem_recibo=$(jq -ce --arg operacao "$operacao_backup" \
    'del(.inicio,.inicioContainer,.primario) + {operacao:$operacao}' <<<"$origem_depois")
  BACKUP_BANCO_VERIFICADO=$(jq -er '.banco' <<<"$origem_recibo")
  export BACKUP_BANCO_VERIFICADO
fi

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
prova_dump=()
if [ -n "$pre_migracao" ]; then
  prova_dump=("$origem_recibo" "$sha")
fi
RECIBO_REMOTO_VERIFICADO="$verificado_remoto" node "$DIR/recibos.mjs" criar "$BACKUP_BANCO_DIR" "$base" "${prova_dump[@]}" >"$tmp/$recibo" ||
  erro "NÃ£o foi possÃ­vel confirmar o conjunto."
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
  node "$DIR/dropbox-autoridade.mjs" publicar "$recibo" ||
    erro "Publicação Dropbox não durável; expurgo suspenso."
fi

if [ -z "$operacao_manual_backup" ]; then
  aplicar_retencao_remota
  aplicar_retencao_local
fi

publicar_metrica_ultimo_backup "$(ler_instante_backup)"

notificar sucesso "Backup do banco concluÃ­do."
log "Backup concluÃ­do: $nome_arquivo (${tamanho} bytes)."
