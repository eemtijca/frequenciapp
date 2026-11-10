#!/usr/bin/env bash
# Valida a identidade antes da primeira subida e a adota depois dos recursos criados.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

uso() {
  cat <<'TEXTO'
Uso:
  identidade.sh --iniciar
  identidade.sh --adotar --confirmar
  identidade.sh --conferir

--iniciar confere projeto, daemon, serviços e volumes declarados antes da
primeira subida. --adotar registra os recursos existentes depois da subida e
exige --confirmar. --conferir compara o registro com os recursos atuais.
TEXTO
}

[ "$#" -gt 0 ] || {
  uso
  erro "Informe --iniciar, --adotar --confirmar ou --conferir."
}

case "$1" in
  --iniciar)
    [ "$#" -eq 1 ] || erro "Use apenas --iniciar."
    carregar_ambiente
    montar_compose
    conferir_identidade inicial
    log "Identidade inicial conferida; a primeira subida pode ser executada."
    ;;
  --adotar)
    [ "${2:-}" = --confirmar ] && [ "$#" -eq 2 ] ||
      erro "Adoção exige --adotar --confirmar após revisar projeto, daemon, labels e mounts."
    carregar_ambiente
    montar_compose
    conferir_identidade adotar
    conferir_identidade conferir
    log "Identidade adotada e relida; nenhuma pilha foi criada ou renomeada."
    ;;
  --conferir)
    [ "$#" -eq 1 ] || erro "Use apenas --conferir."
    carregar_ambiente
    montar_compose
    conferir_identidade conferir
    log "Identidade conferida."
    ;;
  *)
    uso
    erro "Opção desconhecida: $1"
    ;;
esac
