#!/usr/bin/env bash
# Confere se os CLIs e os endpoints de nuvem apontam exclusivamente para o Floci.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
. "$RAIZ/scripts/cloud/floci-ambiente.sh"

floci_carregar_tudo
floci_verificar_endpoints
floci_verificar_identidade
floci_verificar_sem_credencial_real

if command -v aws >/dev/null 2>&1; then
  aws sts get-caller-identity --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null
fi

printf 'Floci confirmado: AWS, Azure e GCP locais, sem credenciais reais.\n'
