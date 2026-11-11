#!/usr/bin/env bash
# Funções comuns das rotinas de servidor auto-hospedado.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
APP_ENV_FILE="${APP_ENV_FILE:-/etc/frequenciapp/app.env}"
OPS_ENV_FILE="${OPS_ENV_FILE:-/etc/frequenciapp/ops.env}"
ESTADO_DIR="${ESTADO_DIR:-/var/lib/frequenciapp}"
LOG_DIR="${LOG_DIR:-/var/log/frequenciapp}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/frequenciapp}"
SERVIDOR_CONFIG_DIR="${SERVIDOR_CONFIG_DIR:-/etc/frequenciapp}"
SERVIDOR_LOCK_DIR="${SERVIDOR_LOCK_DIR:-/var/lock/frequenciapp}"

# Nomes dos serviços usados pelas rotinas. Instalações que usam outro nome de
# serviço no Compose podem sobrescrever sem alterar os scripts.
SERVIDOR_SERVICO_APP="${SERVIDOR_SERVICO_APP:-app}"
SERVIDOR_SERVICO_DB="${SERVIDOR_SERVICO_DB:-db}"
SERVIDOR_SERVICO_BACKUP_PLANILHAS="${SERVIDOR_SERVICO_BACKUP_PLANILHAS:-backup-planilhas}"

COMPOSE=()

log() {
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${0##*/}" "$*"
}

erro() {
  log "ERRO: $*" >&2
  exit 1
}

mascarar_url() {
  printf '%s' "$1" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'
}

ler_campo_json() {
  local arquivo="$1"
  local campo="$2"
  [ -f "$arquivo" ] || erro "Estado JSON não encontrado."
  command -v jq >/dev/null || erro "Instale jq para ler o estado operacional."
  jq -er --arg campo "$campo" '
    if type != "object" then error("objeto obrigatório")
    elif has($campo) | not then ""
    elif .[$campo] | type == "string" then .[$campo]
    else error("string obrigatória") end' "$arquivo" || erro "Estado JSON inválido ou campo de tipo incorreto."
}

backup_remoto_confirmado() {
  local arquivo="$1"
  [ -f "$arquivo" ] || return 1
  command -v jq >/dev/null || erro "Instale jq para verificar a confirmação remota."
  jq -e 'type == "object" and (.verificadoRemoto | type == "boolean") and .verificadoRemoto == true' \
    "$arquivo" >/dev/null 2>&1
}

verificar_permissao_arquivo() {
  local arquivo="$1"
  [ -f "$arquivo" ] || erro "Arquivo não encontrado: $arquivo"
  local modo
  modo=$(stat -c '%a' "$arquivo" 2>/dev/null) ||
    erro "Não foi possível conferir as permissões de $arquivo."
  # Aceita 600, 640, 400 e 440. Recusa escrita de grupo e qualquer acesso
  # de outras contas, porque os arquivos contêm segredos ou credenciais.
  if (( (8#$modo & 8#037) != 0 )); then
    erro "Permissão insegura em $arquivo: use 600 ou 640."
  fi
}

validar_ambiente() {
  local validador="$APP_DIR/scripts/servidor/ambiente-seguro.mjs"
  [ -f "$validador" ] || erro "Validador de ambiente não encontrado: $validador"
  command -v node >/dev/null || erro "Instale Node.js para validar os arquivos de ambiente."
  node "$validador" "$APP_ENV_FILE" "$OPS_ENV_FILE" ||
    erro "Arquivo de ambiente recusado; corrija as linhas apontadas."
}

carregar_ambiente() {
  if [ "${SERVIDOR_AMBIENTE_INJETADO:-false}" = "true" ]; then
    log "Ambiente injetado pelo processo."
    return 0
  fi
  verificar_permissao_arquivo "$APP_ENV_FILE"
  verificar_permissao_arquivo "$OPS_ENV_FILE"
  validar_ambiente
  set -a
  # shellcheck source=/dev/null
  . "$APP_ENV_FILE"
  # shellcheck source=/dev/null
  . "$OPS_ENV_FILE"
  set +a
}

# Restauração e backup usam a imagem registrada pelo último update, a menos
# que o processo já tenha uma imagem explícita no ambiente.
carregar_imagens_do_estado() {
  local arquivo="$ESTADO_DIR/estado.json"
  [ -f "$arquivo" ] || return 0
  if [ -z "${APP_IMAGEM:-}" ]; then
    APP_IMAGEM=$(ler_campo_json "$arquivo" "imagem")
    export APP_IMAGEM
  fi
  if [ -z "${APP_IMAGEM_BACKUP:-}" ]; then
    APP_IMAGEM_BACKUP=$(ler_campo_json "$arquivo" "imagemBackup")
    export APP_IMAGEM_BACKUP
  fi
}

montar_compose_em() {
  local raiz="$1"
  [[ "${COMPOSE_PROJECT_NAME:-}" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || erro "Defina COMPOSE_PROJECT_NAME explicitamente."
  local tipo="${PROXY_TIPO:-caddy}"
  local arquivos=()
  local lista=()
  local arquivo
  local relativo

  if [ -n "${COMPOSE_ARQUIVOS:-}" ]; then
    local IFS=':'
    for relativo in $COMPOSE_ARQUIVOS; do
      case "$relativo" in
        /*) lista+=("$relativo") ;;
        *) lista+=("$raiz/$relativo") ;;
      esac
    done
  else
    lista+=("$raiz/compose.yml" "$raiz/compose.servidor.yml")
    case "$tipo" in
      caddy) lista+=("$raiz/compose.servidor-caddy.yml") ;;
      nginx) lista+=("$raiz/compose.servidor-nginx.yml") ;;
      *) erro "PROXY_TIPO inválido: $tipo. Use caddy ou nginx." ;;
    esac
  fi

  for arquivo in "${lista[@]}"; do
    [ -f "$arquivo" ] || erro "Arquivo Compose não encontrado: $arquivo"
    arquivos+=(-f "$arquivo")
  done

  COMPOSE=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --project-directory "$raiz" \
    --env-file "$APP_ENV_FILE" --env-file "$OPS_ENV_FILE" "${arquivos[@]}")
}

montar_compose() {
  montar_compose_em "$APP_DIR"
}

compose() {
  [ "${#COMPOSE[@]}" -gt 0 ] || erro "Compose não foi montado."
  "${COMPOSE[@]}" "$@"
}

verificar_instalacao() {
  montar_compose
  compose config --quiet || erro "A configuração do Compose não é válida."

  local servicos
  servicos=$(compose --profile backup config --services)
  for servico in "$SERVIDOR_SERVICO_APP" "$SERVIDOR_SERVICO_DB"; do
    printf '%s\n' "$servicos" | grep -qxF "$servico" ||
      erro "O serviço $servico não existe na instalação Compose."
  done

  local tipo="${PROXY_TIPO:-caddy}"
  local servico_proxy="${SERVIDOR_SERVICO_PROXY:-$tipo}"
  printf '%s\n' "$servicos" | grep -qxF "$servico_proxy" ||
    erro "O serviço de proxy $servico_proxy não existe na instalação Compose."

  if [ "${BACKUP_PLANILHAS_HABILITADO:-true}" = "true" ]; then
    printf '%s\n' "$servicos" | grep -qxF "$SERVIDOR_SERVICO_BACKUP_PLANILHAS" ||
      erro "O serviço $SERVIDOR_SERVICO_BACKUP_PLANILHAS não existe na instalação Compose."
  fi

  conferir_identidade auto
  log "Instalação Compose conferida: projeto $COMPOSE_PROJECT_NAME, app $SERVIDOR_SERVICO_APP, banco $SERVIDOR_SERVICO_DB."
}

conferir_identidade() {
  local acao="${1:-auto}"
  local registro="${SERVIDOR_IDENTIDADE_ARQUIVO:-$SERVIDOR_CONFIG_DIR/identidade.json}"
  local captura
  command -v node >/dev/null || erro "Instale Node.js para conferir a identidade operacional."
  captura=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-identidade.XXXXXX")
  chmod 700 "$captura"
  # A captura privada não deve aparecer em logs: config contém ambiente resolvido.
  if ! (
    set -Eeuo pipefail
    trap 'rm -rf "$captura"' EXIT
    umask 077
    compose config --format json >"$captura/config.json" || exit 1
    docker info --format '{{json .}}' >"$captura/daemon.json" || exit 1
    compose ps -aq >"$captura/ids" || exit 1
    mapfile -t ids <"$captura/ids"
    if [ "${#ids[@]}" -gt 0 ]; then
      docker inspect "${ids[@]}" >"$captura/containers.json" || exit 1
    else
      printf '[]\n' >"$captura/containers.json"
    fi
    node --input-type=module -e '
      import fs from "node:fs";
      const [p, projeto, app, db] = process.argv.slice(1);
      const ler = nome => JSON.parse(fs.readFileSync(p+"/"+nome+".json", "utf8"));
      process.stdout.write(JSON.stringify({config:ler("config"),daemon:ler("daemon"),containers:ler("containers"),parametros:{projeto,app,db}}));
    ' "$captura" "$COMPOSE_PROJECT_NAME" "$SERVIDOR_SERVICO_APP" "$SERVIDOR_SERVICO_DB" |
      node "$APP_DIR/scripts/servidor/identidade.mjs" "$acao" "$registro" >"$captura/chave" || exit 1
    cat "$captura/chave"
  ) >"$captura.chave"; then
    rm -rf "$captura" "$captura.chave"
    erro "Identidade não conferida; use a adoção explícita após revisar os recursos."
  fi
  SERVIDOR_ALVO_CHAVE=$(cat "$captura.chave")
  rm -rf "$captura" "$captura.chave"
  export SERVIDOR_ALVO_CHAVE
}

travar() {
  local nome="$1"
  local espera="${2:-0}"
  local base="$SERVIDOR_LOCK_DIR"
  local chave="${SERVIDOR_ALVO_CHAVE:-}"
  [[ "$chave" =~ ^[a-zA-Z0-9_-]+$ ]] || erro "A identidade do alvo precisa ser validada antes da trava."
  local uid_operador uid_atual
  uid_atual=$(id -u)
  uid_operador="$uid_atual"
  if [ -n "${SERVIDOR_USUARIO:-}" ]; then
    uid_operador=$(id -u "$SERVIDOR_USUARIO") || erro "Operador das rotinas não existe."
    [ "$uid_atual" = 0 ] || [ "$uid_atual" = "$uid_operador" ] || erro "Execute como o operador configurado."
  fi
  umask 077
  if [ "$uid_atual" = 0 ] && [ "$uid_operador" != 0 ]; then
    if [ ! -e "$base" ] && [ ! -L "$base" ]; then
      install -d -m 700 -o "$SERVIDOR_USUARIO" -g "$(id -gn "$SERVIDOR_USUARIO")" "$base"
    fi
  else
    mkdir -p "$base"
  fi
  [ ! -L "$base" ] && [ "$(stat -c %u "$base")" = "$uid_operador" ] &&
    [ "$(stat -c %a "$base")" = 700 ] || erro "Diretório de locks deve pertencer ao operador e ter modo 700."
  # O nome do lock deriva da identidade do projeto, não do tipo de operação.
  local arquivo="$base/operacoes-$chave.lock"
  [ ! -L "$arquivo" ] || erro "Lock não pode ser um link."
  if [ "$uid_atual" = 0 ] && [ "$uid_operador" != 0 ] && [ ! -e "$arquivo" ]; then
    # Somente root reduz a identidade para criar; o cron não recebe privilégios.
    local comando
    printf -v comando 'umask 077; set -o noclobber; : >%q' "$arquivo"
    runuser -u "$SERVIDOR_USUARIO" -- bash -c "$comando" ||
      [ -f "$arquivo" ] || erro "Não foi possível provisionar a trava do operador."
  fi
  if [ -n "${SERVIDOR_LOCK_HERDADO:-}" ]; then
    [ "$SERVIDOR_LOCK_HERDADO" = "$arquivo" ] && [ -f "$arquivo" ] &&
      [ "$(stat -Lc '%d:%i' /proc/self/fd/9 2>/dev/null)" = "$(stat -c '%d:%i' "$arquivo")" ] ||
      erro "Descritor herdado não corresponde à trava do alvo."
  else
    exec 9>>"$arquivo"
  fi
  [ -f "$arquivo" ] && [ ! -L "$arquivo" ] &&
    [ "$(stat -c %u "$arquivo")" = "$uid_operador" ] &&
    [ "$(stat -c %a "$arquivo")" = 600 ] || erro "Arquivo de lock deve pertencer ao operador e ter modo 600."
  if [ "$espera" -gt 0 ]; then
    flock -w "$espera" 9 || erro "Outra operação incompatível com $nome está em andamento."
  else
    flock -n 9 || erro "Outra operação incompatível com $nome está em andamento."
  fi
  export SERVIDOR_LOCK_HERDADO="$arquivo"
  # A espera pode atravessar uma alteração externa de recursos ou configuração.
  if [ "${#COMPOSE[@]}" -gt 0 ]; then
    conferir_identidade auto
    [ "$SERVIDOR_ALVO_CHAVE" = "$chave" ] || erro "A identidade mudou enquanto a trava era adquirida."
  fi
}

conferir_banco_compose() {
  local banco="${POSTGRES_DB:-frequencia}" observado
  observado=$(compose exec -T "$SERVIDOR_SERVICO_DB" psql -X \
    -U "${POSTGRES_USER:-frequencia}" -d "$banco" -v ON_ERROR_STOP=1 -tAc 'SELECT current_database();') ||
    erro "Não foi possível comprovar o banco selecionado."
  [ "$observado" = "$banco" ] || erro "Banco efetivo diverge do banco solicitado."
  export BACKUP_BANCO_VERIFICADO="$observado"
}

iniciar_home_gpg() {
  local base="${GPG_BASE_CURTA:-/tmp}"
  [ -d "$base" ] || erro "GPG_BASE_CURTA precisa ser diretório existente e curto."
  GPG_HOME_ANTERIOR="${GNUPGHOME:-}"
  GPG_HOME_OPERACAO=$(mktemp -d "$base/gpg.XXXXXXXX") || erro "Não foi possível criar home GPG privado."
  chmod 700 "$GPG_HOME_OPERACAO"
  [ "$(stat -c %u "$GPG_HOME_OPERACAO")" = "$(id -u)" ] &&
    [ "$(stat -c %a "$GPG_HOME_OPERACAO")" = 700 ] || erro "Home GPG não é privado."
  GPG_HOME_INODE=$(stat -c '%d:%i' "$GPG_HOME_OPERACAO")
  export GNUPGHOME="$GPG_HOME_OPERACAO"
  local socket
  socket=$(gpgconf --homedir "$GNUPGHOME" --list-dirs agent-socket) || {
    limpar_home_gpg; erro "Não foi possível identificar socket GPG.";
  }
  if [ "$(LC_ALL=C printf '%s' "$socket" | wc -c)" -gt 100 ]; then
    limpar_home_gpg
    erro "Socket GPG excede limite portátil; definir GPG_BASE_CURTA em base privada mais curta."
  fi
}

limpar_home_gpg() {
  [ -n "${GPG_HOME_OPERACAO:-}" ] || return 0
  if [ ! -L "$GPG_HOME_OPERACAO" ] && [ -d "$GPG_HOME_OPERACAO" ] &&
    [ "$(stat -c '%d:%i' "$GPG_HOME_OPERACAO")" = "${GPG_HOME_INODE:-}" ]; then
    gpgconf --homedir "$GPG_HOME_OPERACAO" --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf -- "$GPG_HOME_OPERACAO"
  fi
  GPG_HOME_OPERACAO=""
  if [ -n "${GPG_HOME_ANTERIOR:-}" ]; then export GNUPGHOME="$GPG_HOME_ANTERIOR"; else unset GNUPGHOME; fi
}

validar_destinatario_gpg() {
  [[ "${BACKUP_GPG_DESTINATARIO:-}" =~ ^([A-F0-9]{40}|[A-F0-9]{64})$ ]] || erro "Destinatário GPG exige fingerprint completo."
  local chaves
  chaves=$(gpg --batch --with-colons --with-fingerprint --with-subkey-fingerprint --list-keys "$BACKUP_GPG_DESTINATARIO") ||
    erro "Não foi possível listar o destinatário GPG."
  BACKUP_DESTINATARIO_VERIFICADO=$(printf '%s\n' "$chaves" | node "$APP_DIR/scripts/servidor/destinatario.mjs") ||
    erro "Identidade do destinatário GPG não conferida."
  export BACKUP_DESTINATARIO_VERIFICADO
}


espaco_livre_mb() {
  df -Pm "$1" | awk 'NR == 2 { print $4 }'
}

notificar() {
  local status="$1"
  local mensagem="$2"
  [ -n "${NOTIFICAR_URL:-}" ] || return 0
  curl -fsS -m 10 -X POST \
    -H 'Content-Type: application/json' \
    --data "{\"status\":\"$status\",\"mensagem\":\"$mensagem\"}" \
    "$NOTIFICAR_URL" >/dev/null || true
}

criar_diretorios() {
  mkdir -p "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_DIR"
  chmod 700 "$ESTADO_DIR" "$BACKUP_DIR" 2>/dev/null || true
  chmod 750 "$LOG_DIR" 2>/dev/null || true
}
