#!/usr/bin/env bash
# Valida os arquivos de servidor, proxy, backup e chart sem tocar na máquina.
set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-validar.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

export AUTH_SECRET="segredo-dummy-de-32-bytes-para-validacao"
export POSTGRES_USER="frequencia"
export POSTGRES_PASSWORD="frequencia"
export POSTGRES_DB="frequencia"
export DOMINIO="frequencia.exemplo.br"
export ACME_EMAIL="administracao@escola.exemplo.br"
export ACME_CA="https://acme-v02.api.letsencrypt.org/directory"
export APP_ENV_FILE="$tmp/app.env"
export OPS_ENV_FILE="$REPO/infra/servidor/servidor.env.example"
export SERVIDOR_CONFIG_DIR="$tmp/config"
export BACKUP_HOST_DIR="$tmp/backups"
mkdir -p "$SERVIDOR_CONFIG_DIR" "$BACKUP_HOST_DIR"

cat >"$APP_ENV_FILE" <<EOF
AUTH_SECRET=$AUTH_SECRET
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
EOF
chmod 600 "$APP_ENV_FILE"

for script in "$REPO"/scripts/servidor/*.sh; do
  bash -n "$script"
done

docker run --rm \
  -v "$REPO:/mnt" \
  -w /mnt \
  koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d \
  -x -P scripts/servidor scripts/servidor/*.sh

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-caddy.yml" \
  config --quiet

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-nginx.yml" \
  config --quiet

for caddyfile in Caddyfile Caddyfile.interno; do
  docker run --rm \
    --env-file "$APP_ENV_FILE" \
    -e "DOMINIO=$DOMINIO" \
    -e "ACME_EMAIL=$ACME_EMAIL" \
    -e "ACME_CA=$ACME_CA" \
    -v "$REPO/infra/servidor/$caddyfile:/etc/caddy/Caddyfile:ro" \
    caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
done

docker build -t frequenciapp-nginx:validar "$REPO/infra/servidor/nginx"

docker run --rm --add-host app:127.0.0.1 \
  frequenciapp-nginx:validar nginx -t

mkdir -p "$tmp/certificados/live/frequenciapp"
docker run --rm \
  -v "$tmp/certificados:/cert" \
  alpine/openssl:3.5.9@sha256:6821afa2476e11be343f29275f2ca24291720ff0a7148bd131fd8e314ff26d9e req -x509 -nodes -newkey rsa:2048 -days 1 \
  -subj "/CN=teste" \
  -keyout /cert/live/frequenciapp/privkey.pem \
  -out /cert/live/frequenciapp/fullchain.pem >/dev/null 2>&1

docker run --rm --add-host app:127.0.0.1 \
  -v "$tmp/certificados:/etc/letsencrypt:ro" \
  frequenciapp-nginx:validar nginx -t

echo "Validação de servidor concluída."
