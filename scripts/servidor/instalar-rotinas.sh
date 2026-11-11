#!/usr/bin/env bash
# Instala somente entradas estáveis de cron e logrotate de um perfil adotado.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
perfil="${SERVIDOR_CONTROLADOR_PERFIL:-/opt/frequenciapp-controlador/perfil.json}"
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --perfil)
      [ "$#" -ge 2 ] || exit 78
      perfil="$2"
      shift 2
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done
[ "$(id -u)" = 0 ] || {
  printf 'A instalação requer root.\n' >&2
  exit 78
}
exec node "$DIR/controlador/cli.mjs" executar "$perfil" instalar-rotinas "${args[@]}"
