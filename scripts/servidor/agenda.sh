#!/usr/bin/env bash
# Dispara a agenda periódica dentro do contêiner da aplicação.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
verificar_instalacao
exec "${COMPOSE[@]}" exec -T \
  -e "AGENDA_URL=${AGENDA_URL:-http://127.0.0.1:3000}" \
  -e "AGENDA_TIMEOUT=${AGENDA_TIMEOUT:-300}" \
  -e "AGENDA_NOTIFICACOES=${AGENDA_NOTIFICACOES-true}" \
  -e "AGENDA_PLANILHAS=${AGENDA_PLANILHAS-true}" \
  -e "AGENDA_INDICADORES=${AGENDA_INDICADORES-true}" \
  "$SERVIDOR_SERVICO_APP" node scripts/servidor/agenda.mjs
