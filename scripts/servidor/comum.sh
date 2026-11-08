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
  [ -f "$arquivo" ] || return 0
  grep -o "\"$campo\":\"[^\"]*\"" "$arquivo" | head -n 1 | cut -d'"' -f4 || true
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

carregar_ambiente() {
  if [ "${SERVIDOR_AMBIENTE_INJETADO:-false}" = "true" ]; then
    log "Ambiente injetado pelo processo."
    return 0
  fi
  verificar_permissao_arquivo "$APP_ENV_FILE"
  verificar_permissao_arquivo "$OPS_ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  . "$APP_ENV_FILE"
  # shellcheck source=/dev/null
  . "$OPS_ENV_FILE"
  set +a
}

montar_compose_em() {
  local raiz="$1"
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

  COMPOSE=(docker compose --project-directory "$raiz" \
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

  local projeto=""
  projeto=$(compose config --format json 2>/dev/null |
    grep -m1 -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' |
    sed -E 's/.*"([^"]*)"$/\1/' || true)
  log "Instalação Compose identificada: projeto ${projeto:-desconhecido}, app $SERVIDOR_SERVICO_APP, banco $SERVIDOR_SERVICO_DB, proxy $servico_proxy."
}

travar() {
  local nome="$1"
  local espera="${2:-0}"
  mkdir -p "$ESTADO_DIR"
  chmod 700 "$ESTADO_DIR" 2>/dev/null || true
  exec 9>"$ESTADO_DIR/${nome}.lock"
  if [ "$espera" -gt 0 ]; then
    flock -w "$espera" 9 || erro "Outra execução de $nome está em andamento."
  else
    flock -n 9 || erro "Outra execução de $nome está em andamento."
  fi
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
