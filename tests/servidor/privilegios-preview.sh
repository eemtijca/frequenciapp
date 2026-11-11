#!/usr/bin/env bash
# Executa o perfil fechado de privilégios preview em PostgreSQL descartável.
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$RAIZ/tests/servidor/privilegios-preview-harness.mjs" --executar "$@"
