#!/usr/bin/env bash
# Notifica falhas das rotinas do FrequenciApp no journal e por webhook opcional.
set -Eeuo pipefail

umask 077

OPS_ENV_FILE="${OPS_ENV_FILE:-/etc/frequenciapp/ops.env}"

registrar() {
  local prioridade="$1"
  shift
  if command -v logger >/dev/null 2>&1; then
    logger -p "user.${prioridade}" -t frequenciapp-notificar -- "$*" 2>/dev/null || true
  fi
  printf '%s\n' "$*" >&2
}

sanitizar() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9@._:/ -' '_' | cut -c1-200
}

unidade=$(sanitizar "${1:-unidade-desconhecida}")
motivo=$(sanitizar "${2:-falha na execucao}")

ler_url_do_arquivo() {
  local valor
  valor=$(sed -n '/^[[:space:]]*NOTIFICAR_URL=/{s/^[[:space:]]*NOTIFICAR_URL=//;p;q;}' "$OPS_ENV_FILE")
  valor=${valor%$'\r'}
  case "$valor" in
    \"*\") valor=${valor:1:${#valor}-2} ;;
    \'*\') valor=${valor:1:${#valor}-2} ;;
  esac
  printf '%s' "$valor"
}

if [ -z "${NOTIFICAR_URL:-}" ] && [ -r "$OPS_ENV_FILE" ]; then
  NOTIFICAR_URL=$(ler_url_do_arquivo)
fi

mensagem="Falha em ${unidade}: ${motivo}."
registrar err "$mensagem"

[ -n "${NOTIFICAR_URL:-}" ] || exit 0
if ! command -v curl >/dev/null 2>&1; then
  registrar warning "curl ausente; notificacao HTTP nao enviada."
  exit 0
fi

url="$NOTIFICAR_URL"
case "$url" in
  http://* | https://*) ;;
  *)
    registrar warning "NOTIFICAR_URL invalida; notificacao HTTP nao enviada."
    exit 0
    ;;
esac
case "$url" in
  *$'\n'* | *$'\r'*)
    registrar warning "NOTIFICAR_URL invalida; notificacao HTTP nao enviada."
    exit 0
    ;;
esac

hospedeiro=$(sanitizar "$(hostname 2>/dev/null || printf 'desconhecido')")
corpo=$(printf '{"status":"falha","unidade":"%s","mensagem":"%s","host":"%s"}' \
  "$unidade" "$motivo" "$hospedeiro")

url_config=${url//\\/\\\\}
url_config=${url_config//\"/\\\"}

if printf 'url = "%s"\n' "$url_config" | curl -fsS -m 10 -K - \
  -X POST -H 'Content-Type: application/json' --data-binary "$corpo" >/dev/null 2>&1; then
  registrar info "Notificacao HTTP enviada para a falha em ${unidade}."
else
  registrar warning "Nao foi possivel enviar a notificacao HTTP da falha em ${unidade}."
fi
