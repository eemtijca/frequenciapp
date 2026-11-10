#!/usr/bin/env bash
# Entrada exclusiva para o ensaio mutante futuro, nunca uma URL do host.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ ! -f tests/isolamento/executar.mjs ]; then
  printf 'O ensaio de privilégios exige o executor de isolamento da issue #423-C.\n' >&2
  exit 77
fi
exec node tests/isolamento/executar.mjs -- node tests/apoio/privilegios-runtime.mjs
