#!/usr/bin/env bash
# Prova recusa antes dos clientes quando validação URL não tem ownership demonstrado.
set -Eeuo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
for cliente in pg_restore psql pg_dump; do
  cat >"$tmp/bin/$cliente" <<'CLIENTE'
#!/usr/bin/env bash
printf '%s\n' "$0 $*" >>"$CLIENTE_LOG"
if [[ "$0" == *psql ]]; then printf '1\n'; else cat >/dev/null; fi
CLIENTE
  chmod +x "$tmp/bin/$cliente"
done
printf 'arquivo sintetico, nao dump\n' >"$tmp/dump"
export PATH="$tmp/bin:$PATH" CLIENTE_LOG="$tmp/clientes.log"
export SERVIDOR_AMBIENTE_INJETADO=true BACKUP_MODO=url ESTADO_DIR="$tmp/estado" SERVIDOR_LOCK_DIR="$tmp/locks"
export BACKUP_DATABASE_URL=postgresql://sintetico@alias-a/base
for validacao in postgresql://sintetico@alias-b/base 'postgresql://sintetico@alias-a/base?application_name=ensaio'; do
  if BACKUP_RESTAURACAO_URL_VALIDACAO="$validacao" bash "$raiz/scripts/servidor/restaurar.sh" --arquivo "$tmp/dump" --confirmar --sem-copia --aplicacao-parada >"$tmp/saida.log" 2>&1; then
    printf 'Validação arbitrária foi aceita.\n' >&2; exit 1
  fi
  [ ! -s "$CLIENTE_LOG" ] || { cat "$CLIENTE_LOG"; printf 'Cliente consultou alvo sem prova.\n' >&2; exit 1; }
  grep -q 'validação URL pré-provisionada' "$tmp/saida.log"
done
printf 'Modo sem ownership recusado antes dos clientes.\n'
