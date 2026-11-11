#!/usr/bin/env bash
# Expõe somente consultas Compose; mutações pertencem às entradas do controlador.
set -Eeuo pipefail
case "${1:-}" in
  config | ps | images | version | logs) ;;
  *)
    printf 'ERRO: mutação Compose arbitrária não é entrada do operador; usar controlador adotado.\n' >&2
    exit 78
    ;;
esac
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"
carregar_ambiente
montar_compose
conferir_identidade conferir
travar compose 0
exec "${COMPOSE[@]}" "$@"
