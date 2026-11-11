#!/usr/bin/env bash
# Executa leituras do atualizador; aplicações exigem o perfil ROOT operacional.
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cada caso cria a própria raiz e limpa o ambiente antes de instalar seus dublês.
# As aplicações foram migradas funcionalmente para operacional.e2e.mjs, não
# convertidas em expectativas de bloqueio. O perfil controlador-root as descobre.
for caso in simular-registrar bloqueio-atualizacao registrar-disponivel diagnostico-diff \
  identidade-inicial identidade-ausente identidade-adotada simulacao refs; do
  ATUALIZACAO_CASO="$caso" bash "$DIR/atualizacao-falhas.sh"
done
printf 'Leituras do atualizador concluídas; aplicações pertencem ao perfil controlador-root.\n'
