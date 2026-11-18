#!/bin/sh
# Substitui o domínio no arquivo do blackbox, que não expande variáveis, e inicia a sonda.
set -eu

: "${DOMINIO:?DOMINIO ausente}"

case "$DOMINIO" in
  *[!A-Za-z0-9.-]*)
    echo "DOMINIO contém caracteres inválidos." >&2
    exit 1
    ;;
esac

umask 077
sed "s|__DOMINIO__|$DOMINIO|g" /etc/blackbox_exporter/blackbox.yml >/tmp/blackbox.yml

exec /bin/blackbox_exporter "$@"
