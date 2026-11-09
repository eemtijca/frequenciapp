#!/usr/bin/env bash
# Recusa ensaios administrativos ainda sem provisionamento e prova próprios.

exigir_harness_administrativo() {
  # Não existe bypass por variável, nome Compose ou manifesto fornecido pelo chamador.
  # O executor de API não fornece transporte Docker confinado para rotinas de servidor.
  printf 'BLOQUEADO: %s exige o harness administrativo com ownership verificado. Nenhum ensaio real foi executado. Contrato: tests/servidor/isolamento-contrato.md\n' \
    "${1:-ensaio administrativo}" >&2
  return 78
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  exigir_harness_administrativo "${1:-ensaio administrativo}"
fi
