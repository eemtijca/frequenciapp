#!/usr/bin/env bash
# Exercita exclusão mútua local por identidade de projeto, sem daemon.
set -Eeuo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ESTADO_DIR="$tmp/estado" SERVIDOR_LOCK_DIR="$tmp/locks"
export SERVIDOR_ALVO_CHAVE=projeto-a
. "$raiz/scripts/servidor/comum.sh"
mkdir -p "$ESTADO_DIR"
mkfifo "$tmp/entrou-a" "$tmp/liberar-a"
exec 7<>"$tmp/entrou-a"
exec 8<>"$tmp/liberar-a"

# O mesmo projeto serializa entre operações diferentes.
for primeiro in backup-banco restauracao atualizacao; do
  (
    travar "$primeiro" 0
    printf 'entrou\n' >&7
    read -r _ <&8
  ) &
  pid=$!
  read -r _ <&7
  for segundo in backup-banco restauracao atualizacao; do
    if (SERVIDOR_ALVO_CHAVE=projeto-a; travar "$segundo" 0) 2>/dev/null; then
      printf 'Operações do mesmo projeto entraram juntas: %s/%s\n' "$primeiro" "$segundo" >&2
      kill "$pid"
      wait "$pid" || true
      exit 1
    fi
  done
  printf 'liberar\n' >&8
  wait "$pid"
done

# Projetos independentes progridem em paralelo, mesmo com operações críticas.
(
  SERVIDOR_ALVO_CHAVE=projeto-b
  travar backup-banco 0
  printf 'entrou\n' >&7
  read -r _ <&8
) &
pid=$!
read -r _ <&7
if ! (SERVIDOR_ALVO_CHAVE=projeto-c; travar atualizacao 0); then
  printf 'Projetos independentes foram bloqueados entre si.\n' >&2
  kill "$pid"
  wait "$pid" || true
  exit 1
fi
printf 'liberar\n' >&8
wait "$pid"

# O modo URL não compartilha a trava de um projeto Compose.
(
  SERVIDOR_ALVO_CHAVE=url-conservador
  travar backup-banco 0
  printf 'entrou\n' >&7
  read -r _ <&8
) &
pid=$!
read -r _ <&7
if ! (SERVIDOR_ALVO_CHAVE=projeto-a; travar backup-banco 0); then
  printf 'A trava conservadora de URL bloqueou um projeto Compose.\n' >&2
  kill "$pid"
  wait "$pid" || true
  exit 1
fi
printf 'liberar\n' >&8
wait "$pid"

# O descritor herdado só vale para a identidade que o criou.
(
  SERVIDOR_ALVO_CHAVE=projeto-a
  travar atualizacao 0
  bash -c '. "$1"; travar backup-banco 0' _ "$raiz/scripts/servidor/comum.sh"
  if (
    SERVIDOR_ALVO_CHAVE=projeto-b
    bash -c '. "$1"; travar backup-banco 0' _ "$raiz/scripts/servidor/comum.sh"
  ) 2>/dev/null; then
    printf 'Descritor herdado de outro projeto foi aceito.\n' >&2
    exit 1
  fi
)
if (SERVIDOR_LOCK_HERDADO=/alheio; travar backup-banco 0) 2>/dev/null; then
  printf 'Lock herdado inválido foi aceito.\n' >&2
  exit 1
fi
printf 'Concorrência por identidade de projeto verificada.\n'
