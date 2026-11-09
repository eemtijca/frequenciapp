#!/bin/bash
# Executa o navegador somente na pilha sintética provada pelo executor.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$RAIZ/tests/isolamento/executar.mjs" -- pnpm exec playwright test "$@"
