#!/usr/bin/env bash
# Instala um snapshot administrativo fora do checkout, sem instalar cron ou sudo.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(id -u)" = 0 ] || {
  printf 'A instalação requer root.\n' >&2
  exit 78
}
exec node "$DIR/controlador/cli.mjs" instalar "$@"
