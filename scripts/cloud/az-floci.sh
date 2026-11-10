#!/usr/bin/env bash
# Executa o Azure CLI contra o Floci, recusando argumentos de nuvem real.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
. "$RAIZ/scripts/cloud/floci-ambiente.sh"

floci_carregar_azure
floci_verificar_endpoints

if ! az cloud show --query name -o tsv 2>/dev/null | grep -qx 'floci-az'; then
  printf 'ERRO: execute floci az setup antes de usar o Azure CLI.\n' >&2
  exit 1
fi

for argumento in "$@"; do
  case "$argumento" in
    *management.azure.com*|*login.microsoftonline.com*|*amazonaws.com*|*googleapis.com*)
      printf 'ERRO: argumento de nuvem real recusado: %s\n' "$argumento" >&2
      exit 1
      ;;
  esac
done

exec az "$@"
