#!/usr/bin/env bash
# Executa os ensaios do servidor em ordem, do mais rápido ao descartável.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=isolamento-entradas.sh
. "$DIR/isolamento-entradas.sh"
exigir_harness_administrativo suite-servidor || {
  if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then exit 78; fi
  return 78
}

bash "$DIR/atualizacao.sh"
bash "$DIR/backup-restauracao.sh"
bash "$DIR/restauracao-url.sh"
bash "$DIR/atualizacao-integracao.sh"

printf 'Todos os ensaios do servidor foram concluídos.\n'
