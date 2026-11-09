#!/usr/bin/env bash
# Exercita exclusão mútua local com barreira por descritor, sem daemon.
set -Eeuo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ESTADO_DIR="$tmp/estado" SERVIDOR_LOCK_DIR="$tmp/locks"
export SERVIDOR_ALVO_CHAVE=alvo-sintetico-validado
. "$raiz/scripts/servidor/comum.sh"
mkdir -p "$ESTADO_DIR"
mkfifo "$tmp/entrou" "$tmp/liberar"
exec 7<>"$tmp/entrou"
exec 8<>"$tmp/liberar"
for primeiro in backup-banco restauracao atualizacao; do
  (
    travar "$primeiro" 0
    printf 'entrou\n' >&7
    read -r _ <&8
  ) &
  pid=$!
  read -r _ <&7
  for segundo in backup-banco restauracao atualizacao; do
    if (travar "$segundo" 0) 2>/dev/null; then
      printf 'Operações incompatíveis entraram juntas: %s/%s\n' "$primeiro" "$segundo" >&2
      kill "$pid"; wait "$pid" || true; exit 1
    fi
  done
  # URL pode referir o Compose: sem prova de distinção, ambos disputam o host.
  for chave in url-conservador outro-alvo; do
    if (SERVIDOR_ALVO_CHAVE="$chave"; travar backup-banco 0) 2>/dev/null; then
      printf 'OP-03: modos sem distinção comprovada entraram juntos: %s\n' "$chave" >&2
      kill "$pid"; wait "$pid" || true; exit 1
    fi
  done
  printf 'liberar\n' >&8
  wait "$pid"
done
(travar backup-banco 0; exit 7) || [ "$?" -eq 7 ]
(travar restauracao 0)
# Um filho legítimo reaproveita o descritor; variável sem descritor não libera.
(
  travar atualizacao 0
  bash -c '. "$1"; travar backup-banco 0' _ "$raiz/scripts/servidor/comum.sh"
)
if (SERVIDOR_LOCK_HERDADO=/alheio; travar backup-banco 0) 2>/dev/null; then
  printf 'Lock herdado inválido foi aceito.\n' >&2; exit 1
fi
printf 'Concorrência sintética verificada.\n'
