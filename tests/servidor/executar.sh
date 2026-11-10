#!/usr/bin/env bash
# Executa os ensaios do servidor em ordem, do mais rápido ao descartável.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$DIR/atualizacao.sh"
bash "$DIR/backup-restauracao.sh"
bash "$DIR/restauracao-url.sh"
bash "$DIR/privilegios-preview.sh"
bash "$DIR/atualizacao-integracao.sh"

printf 'Todos os ensaios do servidor foram concluídos.\n'
