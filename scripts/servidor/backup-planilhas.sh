#!/usr/bin/env bash
# Executa o backup das planilhas no contêiner de backup.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
montar_compose
exec "${COMPOSE[@]}" --profile backup run --rm backup-planilhas
