#!/usr/bin/env bash
# Emite ou renova o certificado do Nginx com Certbot.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente

if [ "${PROXY_TIPO:-caddy}" != "nginx" ]; then
  log "O proxy não é Nginx; o Caddy renova os certificados sozinho."
  exit 0
fi

if [ "${TLS_MODO:-acme}" != "acme" ]; then
  log "O modo TLS é interno; o Certbot não é usado."
  exit 0
fi

montar_compose

cert_dir="${CERTBOT_CERTS_DIR:-$APP_DIR/infra/servidor/nginx/certificados}"
case "$cert_dir" in
  /*) ;;
  *) cert_dir="$APP_DIR/${cert_dir#./}" ;;
esac
mkdir -p "$cert_dir"

acao="renovar"
for arg in "$@"; do
  case "$arg" in
    --inicial) acao="inicial" ;;
    --dry-run) acao="teste" ;;
    *)
      erro "Opção desconhecida: $arg"
      ;;
  esac
done

if [ "$acao" = "inicial" ]; then
  [ -n "${DOMINIO:-}" ] || erro "Defina DOMINIO."
  [ -n "${ACME_EMAIL:-}" ] || erro "Defina ACME_EMAIL."
  argumentos=(
    certonly
    --webroot
    -w /var/www/certbot
    -d "$DOMINIO"
    --cert-name frequenciapp
    --email "$ACME_EMAIL"
    --agree-tos
    --no-eff-email
    --non-interactive
  )
  [ -n "${ACME_CA:-}" ] && argumentos+=(--server "$ACME_CA")
  log "Emitindo o certificado inicial para $DOMINIO."
  compose --profile certbot run --rm certbot "${argumentos[@]}"
  log "Recriando o Nginx para carregar o certificado."
  compose up -d --force-recreate nginx
  exit 0
fi

if [ "$acao" = "teste" ]; then
  log "Testando a renovação sem gravar certificado."
  compose --profile certbot run --rm certbot \
    renew --webroot -w /var/www/certbot --dry-run
  exit 0
fi

log "Renovando certificados."
compose --profile certbot run --rm certbot \
  renew --webroot -w /var/www/certbot --quiet

if compose ps --status running --services | grep -qx nginx; then
  log "Recarregando o Nginx."
  compose exec -T nginx nginx -s reload
fi

log "Renovação concluída."
