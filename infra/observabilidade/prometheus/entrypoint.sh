#!/bin/sh
# Prepara o token de coleta fora da configuração e inicia o Prometheus.
set -eu

umask 077

: "${METRICAS_TOKEN:?METRICAS_TOKEN ausente}"

case "$METRICAS_TOKEN" in
  *[!A-Za-z0-9_-]*)
    echo "METRICAS_TOKEN contém caracteres inválidos." >&2
    exit 1
    ;;
esac

if [ "${#METRICAS_TOKEN}" -lt 32 ]; then
  echo "METRICAS_TOKEN precisa ter pelo menos 32 caracteres." >&2
  exit 1
fi

printf '%s' "$METRICAS_TOKEN" >/tmp/metricas-token

exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --web.listen-address=0.0.0.0:9090
