#!/usr/bin/env bash
# Executa o AWS CLI contra o Floci, recusando argumentos de nuvem real.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
. "$RAIZ/scripts/cloud/floci-ambiente.sh"

floci_carregar_aws
floci_verificar_endpoints

for argumento in "$@"; do
  case "$argumento" in
    *amazonaws.com*|*azure.com*|*googleapis.com*)
      printf 'ERRO: argumento de nuvem real recusado: %s\n' "$argumento" >&2
      exit 1
      ;;
  esac
done

exec aws --endpoint-url "$AWS_ENDPOINT_URL" "$@"
