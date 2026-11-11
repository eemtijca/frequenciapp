#!/usr/bin/env bash
# Executa o ensaio real por URL com fontes estáveis e contêineres próprios sem portas.
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$RAIZ/tests/servidor/restauracao-url-harness.mjs" "$@"
