#!/bin/sh
# Escolhe a configuração do Nginx conforme o certificado do domínio existir.
set -eu

if [ -f /etc/letsencrypt/live/frequenciapp/fullchain.pem ] &&
  [ -f /etc/letsencrypt/live/frequenciapp/privkey.pem ]; then
  cp /etc/nginx/modelos/https.conf /etc/nginx/conf.d/default.conf
else
  cp /etc/nginx/modelos/http.conf /etc/nginx/conf.d/default.conf
fi
