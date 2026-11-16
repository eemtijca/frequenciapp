#!/usr/bin/env bash
# Dublê sintético do backup-banco.sh para os testes do comando canal.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

if [ "${CANAL_TESTE_BACKUP_FALHA:-0}" = "1" ]; then
  printf '%s\n' "falha simulada no backup" >&2
  exit 1
fi

: "${ESTADO_DIR:?}"
backupDir="${BACKUP_BANCO_DIR:-$ESTADO_DIR/backups}"
recibo="frequenciapp-20261111T120000Z-abcdef12.confirmado.json"
base="${recibo%.confirmado.json}"
arquivo="$base.dump.gpg"
conteudo="dump sintetico do teste de canal"
sha=$(printf '%s' "$conteudo" | sha256sum | cut -d' ' -f1)

if [ "${1:-}" = "--verificar" ]; then
  # A autoridade deve ser resolvida pelo verificador, nunca herdada do chamador.
  [ -z "${SERVIDOR_ALVO_CHAVE:-}" ] || exit 1
  [ -z "${BACKUP_BANCO_VERIFICADO:-}" ] || exit 1
  [ "${CANAL_TESTE_VERIFICACAO_FALHA:-0}" != "1" ] || exit 1
  SERVIDOR_ALVO_CHAVE=alvo-sintetico \
  BACKUP_BANCO_VERIFICADO=frequencia \
  DATABASE_SCHEMA=public \
  BACKUP_REMOTO= \
    node "$APP_DIR/scripts/servidor/recibos.mjs" conferir-estado "$backupDir" "$ESTADO_DIR/ultimo-backup.json"
  exit $?
fi

mkdir -p "$backupDir" "$ESTADO_DIR/recibos"
printf '%s' "$conteudo" >"$backupDir/$arquivo"
printf '%s  %s\n' "$sha" "$arquivo" >"$backupDir/$arquivo.sha256"
sha_side=$(sha256sum "$backupDir/$arquivo.sha256" | cut -d' ' -f1)
printf '{"versao":1,"base":"%s","em":"2026-11-11T12:00:00Z","escopo":{"tipo":"schema","schema":"public","alvo":"alvo-sintetico","banco":"frequencia"},"criptografia":"gpg","destinatario":"chave-sintetica","remoto":"","etapas":{"local":true,"remotoVerificado":false,"recuperacaoExercitada":false},"artefatos":[{"nome":"%s","sha256":"%s"},{"nome":"%s.sha256","sha256":"%s"}]}\n' \
  "$base" "$arquivo" "$sha" "$arquivo" "$sha_side" >"$backupDir/$recibo"
cp "$backupDir/$recibo" "$ESTADO_DIR/recibos/$recibo"
printf '{"em":"2026-11-11T12:00:00Z","modo":"compose","criptografia":"gpg","arquivo":"%s","sha256":"%s","recibo":"%s","verificadoRemoto":false}\n' \
  "$arquivo" "$sha" "$recibo" >"$ESTADO_DIR/ultimo-backup.json"
chmod 600 "$ESTADO_DIR/ultimo-backup.json"
printf '%s\n' "Backup sintético concluído."
