#!/usr/bin/env bash
# Prepara o arquivo secreto só no runner e o remove ao concluir, falhar ou receber interrupção.
set +x
set -euo pipefail
umask 077

if [[ -z "${RUNNER_TEMP:-}" || "$RUNNER_TEMP" != /* || "$RUNNER_TEMP" == / ]]; then
  printf '%s\n' 'O backup exige uma pasta temporária absoluta do runner.' >&2
  exit 1
fi
pasta="$RUNNER_TEMP/frequenciapp-backup-actions"

limpar() {
  if ! rm -rf -- "$pasta" 2>/dev/null; then
    printf '%s\n' 'Não foi possível remover os temporários do backup.' >&2
    return 1
  fi
}

validar() {
  local variavel segredo
  for variavel in BACKUP_RCLONE_CONFIG_CONTEUDO BACKUP_ORIGEM BACKUP_DESTINO BACKUP_CHAVE; do
    if [[ -z "${!variavel:-}" ]]; then
      segredo="$variavel"
      [[ "$variavel" != BACKUP_RCLONE_CONFIG_CONTEUDO ]] || segredo=BACKUP_RCLONE_CONFIG
      printf 'Configure o secret %s do backup.\n' "$segredo" >&2
      return 1
    fi
  done
  if (( ${#BACKUP_CHAVE} < 32 || ${#BACKUP_CHAVE} > 256 )); then
    printf '%s\n' 'A chave de recuperação deve ter de 32 a 256 caracteres.' >&2
    return 1
  fi
  if [[ "$BACKUP_RCLONE_CONFIG_CONTEUDO" == *RCLONE_ENCRYPT_V0:* && -z "${RCLONE_CONFIG_PASS:-}" ]]; then
    printf '%s\n' 'Configure RCLONE_CONFIG_PASS para abrir a configuração criptografada.' >&2
    return 1
  fi
}

case "${1:-}" in
  --validar)
    [[ $# == 1 ]] || exit 1
    validar
    exit 0
    ;;
  --limpar)
    [[ $# == 1 ]] || exit 1
    limpar
    exit 0
    ;;
  '') [[ $# == 0 ]] || exit 1 ;;
  *) exit 1 ;;
esac

validar
if ! mkdir -m 700 -- "$pasta" 2>/dev/null; then
  printf '%s\n' 'A pasta privada do backup não pôde ser criada.' >&2
  exit 1
fi
trap 'codigo=$?; trap - EXIT; limpar || exit 1; exit "$codigo"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export BACKUP_RCLONE_CONFIG="$pasta/rclone.conf"
export TMPDIR="$pasta/temporarios"
mkdir -m 700 -- "$TMPDIR"
printf '%s' "$BACKUP_RCLONE_CONFIG_CONTEUDO" > "$BACKUP_RCLONE_CONFIG"
unset BACKUP_RCLONE_CONFIG_CONTEUDO

diretorio_script="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
node "$diretorio_script/backup-externo.mjs"
