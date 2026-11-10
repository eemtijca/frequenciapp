#!/usr/bin/env bash
# Executa o backup das planilhas no contêiner de backup.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
verificar_instalacao
travar backup-planilhas 0
exec "${COMPOSE[@]}" --profile backup run --rm "$SERVIDOR_SERVICO_BACKUP_PLANILHAS"
