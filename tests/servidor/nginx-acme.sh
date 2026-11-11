#!/usr/bin/env bash
# Encaminha somente a invocação explícita ao ensaio fechado Nginx/ACME.
set -Eeuo pipefail
if [[ $# -lt 1 || $# -gt 2 || ${1-} != --executar ]]; then
  printf 'uso: nginx-acme.sh --executar [--evidencias=/pasta-nova]\n' >&2
  exit 78
fi
if [[ $# -eq 2 && ! $2 =~ ^--evidencias=/[^,[:cntrl:]]+$ ]]; then
  printf 'uso: nginx-acme.sh --executar [--evidencias=/pasta-nova]\n' >&2
  exit 78
fi
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$RAIZ/tests/servidor/nginx-acme-harness.mjs" "$@"
