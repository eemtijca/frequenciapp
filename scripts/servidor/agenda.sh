#!/usr/bin/env bash
# Dispara a agenda periódica dentro do contêiner da aplicação.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
verificar_instalacao
exec "${COMPOSE[@]}" exec -T "$SERVIDOR_SERVICO_APP" node scripts/servidor/agenda.mjs
