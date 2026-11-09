#!/usr/bin/env bash
# Registra recursos existentes apenas mediante adoção explícita e conferida.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/comum.sh"
[ "${1:-}" = --adotar ] && [ "${2:-}" = --confirmar ] && [ "$#" -eq 2 ] ||
  erro "Uso: identidade.sh --adotar --confirmar. Revisar antes projeto, daemon, labels e mounts."
carregar_ambiente
montar_compose
conferir_identidade adotar
conferir_identidade conferir
log "Identidade adotada e relida; nenhuma pilha foi criada ou renomeada."
