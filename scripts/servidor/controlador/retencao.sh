#!/usr/bin/env bash
# Aplica somente o plano local de retenção tipada sob a trava do alvo adotado.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../comum.sh
. "$DIR/comum.sh"
[ "$#" = 0 ] || erro "A retenção não aceita opções do operador."
carregar_ambiente
verificar_instalacao
travar retencao 0
conferir_banco_compose
export BACKUP_RETER_DIAS="${BACKUP_RETER_DIAS:-30}" BACKUP_RETER_MINIMO="${BACKUP_RETER_MINIMO:-5}"
tmp=$(mktemp "$ESTADO_DIR/.retencao.XXXXXXXX")
trap 'rm -f -- "$tmp"' EXIT
node "$DIR/recibos.mjs" planejar-local "$BACKUP_BANCO_DIR" >"$tmp" || erro "Plano local inválido."
while IFS=$'\t' read -r conjunto nome; do
  [ -n "$nome" ] || continue
  if ! { [[ "$nome" != */* ]] && [[ "$nome" == frequenciapp-* ]]; }; then
    erro "Membro inválido."
  fi
  rm -- "$BACKUP_BANCO_DIR/$nome" || erro "Expurgo local parcial; revisar o conjunto $conjunto."
done <"$tmp"
