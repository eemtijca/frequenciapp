#!/usr/bin/env bash
# Dublê sintético do backup-banco.sh para os testes do comando canal.
set -Eeuo pipefail

if [ "${CANAL_TESTE_BACKUP_FALHA:-0}" = "1" ]; then
  printf '%s\n' "falha simulada no backup" >&2
  exit 1
fi

: "${ESTADO_DIR:?}"
backupDir="${BACKUP_BANCO_DIR:-$ESTADO_DIR/backups}"
recibo="frequenciapp-20261111T120000Z-abcdef12.confirmado.json"
arquivo="frequenciapp-20261111T120000Z-abcdef12.dump.gpg"
conteudo="dump sintetico do teste de canal"
sha=$(printf '%s' "$conteudo" | sha256sum | cut -d' ' -f1)
mkdir -p "$backupDir" "$ESTADO_DIR/recibos"
printf '%s' "$conteudo" >"$backupDir/$arquivo"
printf '{}\n' >"$backupDir/$recibo"
printf '{}\n' >"$ESTADO_DIR/recibos/$recibo"
printf '{"em":"2026-11-11T12:00:00Z","modo":"compose","criptografia":"gpg","arquivo":"%s","sha256":"%s","recibo":"%s","verificadoRemoto":false}\n' \
  "$arquivo" "$sha" "$recibo" >"$ESTADO_DIR/ultimo-backup.json"
chmod 600 "$ESTADO_DIR/ultimo-backup.json"
printf '%s\n' "Backup sintético concluído."
