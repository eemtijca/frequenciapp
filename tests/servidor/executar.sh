#!/usr/bin/env bash
# Mantém perfis sintéticos, E2E próprios e legados bloqueados separados, sem skips verdes.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
modo="${1:-todos}"
[ "$#" -le 1 ] || { printf 'Uso: %s [sinteticos|origem-cli|controlador-root|restauracao-url|integracao|todos]\n' "$0" >&2; exit 64; }
case "$modo" in
  sinteticos) exec node "$DIR/sinteticos.mjs" ;;
  origem-cli) exec node "$DIR/../kubernetes/origem-backup-isolado.mjs" --executar ;;
  controlador-root) exec node "$DIR/sinteticos.mjs" --perfil controlador-root ;;
  restauracao-url) exec bash "$DIR/restauracao-url.sh" --executar ;;
  integracao|todos) ;;
  *) printf 'Modo inválido: %s\n' "$modo" >&2; exit 64 ;;
esac

status_sinteticos=nao-solicitado
status_root=0
status_origem=0
status_url=0
if [ "$modo" = todos ]; then
  status_sinteticos=0
  node "$DIR/sinteticos.mjs" || status_sinteticos=$?
fi
node "$DIR/sinteticos.mjs" --perfil controlador-root || status_root=$?
node "$DIR/../kubernetes/origem-backup-isolado.mjs" --executar || status_origem=$?
bash "$DIR/restauracao-url.sh" --executar || status_url=$?
# Guardas inexistentes continuam bloqueios reais; nenhum destes scripts é executado.
for legado in backup-restauracao.sh nginx-acme.sh privilegios-preview.sh atualizacao-integracao.sh; do
  printf 'BLOQUEADO integracao/%s: ownership e limpeza exclusivos ainda não comprovados; não executado.\n' "$legado" >&2
done
printf 'RESULTADO sinteticos=%s E2E/controlador-root=%s E2E/origem-cli=%s E2E/restauracao-url=%s legados-bloqueados=4 codigo-legados=78\n' "$status_sinteticos" "$status_root" "$status_origem" "$status_url"
if [ "$status_sinteticos" != nao-solicitado ] && [ "$status_sinteticos" -ne 0 ]; then exit "$status_sinteticos"; fi
for codigo in "$status_root" "$status_origem" "$status_url"; do
  [ "$codigo" -eq 0 ] || exit "$codigo"
done
exit 78
