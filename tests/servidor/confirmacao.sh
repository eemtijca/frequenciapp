#!/usr/bin/env bash
# Caracteriza os leitores de estado sem cliente administrativo.
set -Eeuo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$raiz/scripts/servidor/comum.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for json in '{ "arquivo" : "backup.gpg", "verificadoRemoto" : true }' '{
 "arquivo": "backup.gpg",
 "verificadoRemoto": true
}'; do
  printf '%s' "$json" >"$tmp/estado"
  [ "$(ler_campo_json "$tmp/estado" arquivo)" = backup.gpg ] || erro "String JSON formatada não foi lida."
  backup_remoto_confirmado "$tmp/estado" || erro "Booleano verdadeiro não reconhecido."
done
for json in '{"verificadoRemoto":false}' '{"verificadoRemoto":"true"}' '{"verificadoRemoto":null}' '{}' '{"verificadoRemoto":'; do
  printf '%s' "$json" >"$tmp/estado"
  if backup_remoto_confirmado "$tmp/estado"; then erro "Confirmação inválida aceita."; fi
done
printf '{"arquivo":' >"$tmp/estado"
if (ler_campo_json "$tmp/estado" arquivo); then erro "Estado corrompido aceito."; fi
printf 'Leitores tipados verificados.
'
