#!/usr/bin/env bash
# Prova root explícita do controlador; não pertence à descoberta comum UID1000.
set -Eeuo pipefail
if ! {
  [ "$(id -u)" = 0 ] && [ -d /sandbox ] && [ -f /repo/tests/servidor/controlador/operacional.e2e.mjs ]
}; then
  printf 'Executar somente no contêiner descartável documentado, com /repo RO e /sandbox tmpfs.\n' >&2
  exit 78
fi
exec node --test "$@" /repo/tests/servidor/controlador/operacional.e2e.mjs
