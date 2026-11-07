#!/usr/bin/env bash
# Executa o Docker Compose com os arquivos e ambientes do servidor.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
montar_compose
exec "${COMPOSE[@]}" "$@"
