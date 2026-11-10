#!/usr/bin/env bash
# Caracteriza os leitores de estado e a confirmação booleana do backup remoto.
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
for json in \
  '{"verificadoRemoto":false}' \
  '{"verificadoRemoto":"true"}' \
  '{"verificadoRemoto":1}' \
  '{"verificadoRemoto":null}' \
  '{"verificadoRemoto":{}}' \
  '{}' \
  '{"verificadoRemoto":' \
  '[]'; do
  printf '%s' "$json" >"$tmp/estado"
  if backup_remoto_confirmado "$tmp/estado"; then
    erro "Confirmação remota inválida foi aceita: $json"
  fi
done
if backup_remoto_confirmado "$tmp/ausente"; then
  erro "Estado de backup ausente foi aceito."
fi
printf '{"arquivo":' >"$tmp/estado"
if (ler_campo_json "$tmp/estado" arquivo) 2>/dev/null; then erro "Estado corrompido aceito."; fi
if (ler_campo_json "$tmp/estado" ausente) 2>/dev/null; then
  erro "Campo ausente em estado corrompido aceito."
fi
printf '{"arquivo":1}' >"$tmp/estado"
if (ler_campo_json "$tmp/estado" arquivo) 2>/dev/null; then
  erro "Campo de tipo incorreto aceito."
fi
printf '{"arquivo":"backup.gpg"}' >"$tmp/estado"
[ "$(ler_campo_json "$tmp/estado" ausente)" = "" ] || erro "Campo ausente deveria retornar vazio."
printf 'Leitores tipados e confirmação booleana verificados.\n'
