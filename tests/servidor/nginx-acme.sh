#!/usr/bin/env bash
# Prova que o Nginx em HTTPS mantém o desafio ACME na porta 80 e redireciona o restante.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-nginx-acme.XXXXXX")"
CONTAINER="frequenciapp-nginx-acme-$$"
IMAGEM="frequenciapp-nginx:acme-teste"

limpar() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap 'limpar' EXIT

falhar() {
  printf 'FALHOU: %s\n' "$*" >&2
  exit 1
}

mkdir -p "$TMP/certificados/live/frequenciapp" "$TMP/www/.well-known/acme-challenge"
printf 'token-sintetico-do-ensaio\n' >"$TMP/www/.well-known/acme-challenge/qa"

docker run --rm -v "$TMP/certificados:/cert" alpine/openssl \
  req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=teste" \
  -keyout /cert/live/frequenciapp/privkey.pem \
  -out /cert/live/frequenciapp/fullchain.pem >/dev/null 2>&1

docker build -q -t "$IMAGEM" "$RAIZ/infra/servidor/nginx" >/dev/null

docker run -d --name "$CONTAINER" --add-host app:127.0.0.1 \
  -v "$TMP/certificados:/etc/letsencrypt:ro" \
  -v "$TMP/www:/var/www/certbot:ro" \
  -p 127.0.0.1::80 -p 127.0.0.1::443 \
  "$IMAGEM" >/dev/null

porta80=""
for _ in $(seq 1 30); do
  porta80="$(docker port "$CONTAINER" 80/tcp 2>/dev/null | head -n 1 | sed 's/.*://' || true)"
  if [ -n "$porta80" ] && curl -fsS --max-time 2 "http://127.0.0.1:$porta80/.well-known/acme-challenge/qa" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
[ -n "$porta80" ] || falhar "a porta 80 não foi publicada."

desafio="$(curl -fsS --max-time 5 "http://127.0.0.1:$porta80/.well-known/acme-challenge/qa")"
[ "$desafio" = "token-sintetico-do-ensaio" ] || falhar "o desafio ACME não foi servido pela porta 80."

codigo="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$porta80/")"
[ "$codigo" = "301" ] || falhar "esperava redirecionamento 301 na porta 80, recebeu $codigo."

localizacao="$(curl -sS --max-time 5 -o /dev/null -D - "http://127.0.0.1:$porta80/" | tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }')"
case "$localizacao" in
  https://*) ;;
  *) falhar "o redirecionamento da porta 80 não aponta para HTTPS: $localizacao" ;;
esac

porta443="$(docker port "$CONTAINER" 443/tcp 2>/dev/null | head -n 1 | sed 's/.*://' || true)"
[ -n "$porta443" ] || falhar "a porta 443 não foi publicada."
codigo="$(curl -ksS --max-time 5 -o /dev/null -w '%{http_code}' "https://127.0.0.1:$porta443/")"
case "$codigo" in
  200|301|302|502|503|504) ;;
  *) falhar "o TLS da porta 443 não respondeu como esperado: $codigo" ;;
esac

printf 'Desafio ACME e redirecionamento da porta 80 confirmados.\n'
