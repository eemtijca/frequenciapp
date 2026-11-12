#!/usr/bin/env bash
# Dublê sintético do atualizar.sh para os testes do comando canal.
set -Eeuo pipefail

modo="auto"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --modo)
      modo="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "${CANAL_TESTE_ATUALIZAR_FALHA:-0}" = "1" ]; then
  printf '%s\n' "falha simulada no atualizar" >&2
  exit 9
fi

: "${ESTADO_DIR:?}"
: "${INSTALADOR_ALVO_COMMIT:?}"
ref="${INSTALADOR_ALVO_TAG:-main}"
[ "$modo" = "main" ] && ref="main"
mkdir -p "$ESTADO_DIR"
printf '{"modo":"%s","ref":"%s","commit":"%s","imagem":"%s","imagemBackup":"%s","atualizadoEm":"%s"}\n' \
  "$modo" "$ref" "$INSTALADOR_ALVO_COMMIT" "${INSTALADOR_ALVO_IMAGEM:-teste}" \
  "${INSTALADOR_ALVO_IMAGEM_BACKUP:-teste-backup}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >"$ESTADO_DIR/estado.json"
chmod 600 "$ESTADO_DIR/estado.json"
