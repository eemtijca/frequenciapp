#!/usr/bin/env bash
# Biblioteca inerte que delega o lifecycle ao harness de recursos próprios.
backup_restauracao() {
  local pasta
  pasta="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || return 1
  node "$pasta/backup-restauracao-harness.mjs" "$@"
}
