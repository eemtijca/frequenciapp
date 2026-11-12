#!/usr/bin/env bash
# Expõe consultas Compose no perfil adotado e mantém o caminho simples genérico.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
perfil="${SERVIDOR_CONTROLADOR_PERFIL:-/opt/frequenciapp-controlador/perfil.json}"
controlador_ativo=false

exigir_consulta() {
  case "${1:-}" in
    config | ps | images | version | logs) ;;
    *)
      printf 'ERRO: mutação Compose arbitrária não é entrada do operador; usar a entrada estável do controlador.\n' >&2
      exit 78
      ;;
  esac
}

if [ -e "$perfil" ] || [ -L "$perfil" ] ||
  [ -n "${SERVIDOR_CONTROLADOR_PERFIL:-}${SERVIDOR_CONTROLADOR_OPERACAO:-}${SERVIDOR_CONTROLADOR_PREPARACAO:-}${SERVIDOR_CONTROLADOR_LEITURA:-}" ]; then
  controlador_ativo=true
  exigir_consulta "${1:-}"
fi

# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
if [ "$controlador_ativo" = false ]; then
  perfil="${SERVIDOR_CONTROLADOR_PERFIL:-$perfil}"
  if [ -e "$perfil" ] || [ -L "$perfil" ] || [ -n "${SERVIDOR_CONTROLADOR_PERFIL:-}" ]; then
    controlador_ativo=true
    exigir_consulta "${1:-}"
  fi
fi
montar_compose
if [ "$controlador_ativo" = true ]; then
  conferir_identidade conferir
  travar compose 0
fi
exec "${COMPOSE[@]}" "$@"
