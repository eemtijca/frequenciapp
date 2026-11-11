#!/usr/bin/env bash
# Entrada fechada do ensaio EngineFake; não cria clientes ou traps fora do perfil.
set -Eeuo pipefail
if [ "$#" -ne 1 ] || [ "$1" != --engine-fake ] || [ "$(id -u)" != 0 ] ||
  [ -S /run/docker.sock ] || [ -S /var/run/docker.sock ] ||
  ! grep -q '^CapEff:[[:space:]]*0000000000000000$' /proc/self/status ||
  ! grep -q '^NoNewPrivs:[[:space:]]*1$' /proc/self/status; then
  printf 'Ensaio restrito ao perfil EngineFake Root/cap0 sem daemon.\n' >&2
  exit 78
fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec /usr/local/bin/node "$DIR/atualizacao-integracao-driver.mjs" --engine-fake
