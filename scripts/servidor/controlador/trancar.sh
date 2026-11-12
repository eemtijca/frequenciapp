#!/usr/bin/env bash
# Mantém a trava física herdável enquanto controlador e filhos estão ativos.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../comum.sh
. "$DIR/../comum.sh"
montar_compose
conferir_identidade conferir
travar "${2:?Operação obrigatória}" 0
exec node "$DIR/cli.mjs" trancado "$@"
