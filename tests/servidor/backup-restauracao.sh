#!/usr/bin/env bash
# Executa backup e restauração reais em Compose sintético, sem cleanup por projeto.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$DIR/lib.sh"
# O chamador escolhe vertical ou restantes e uma pasta privada de evidência.
[ "$#" -eq 2 ] || { printf 'Uso: %s vertical|restantes PASTA_EVIDENCIA\n' "$0" >&2; exit 64; }
backup_restauracao "$@"
