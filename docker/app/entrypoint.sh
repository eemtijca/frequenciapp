#!/bin/sh
# Ponto de entrada do contêiner da aplicação.
# Aguarda o banco, aplica as migrações e inicia o servidor.
set -eu

echo "[entrada] Aguardando o banco..."
# O endereço da migração é mascarado para não expor a senha nos logs.
url_migracao="${DIRECT_URL:-${DATABASE_URL:-}}"
if [ -z "$url_migracao" ]; then
  echo "[entrada] Defina DIRECT_URL ou DATABASE_URL antes de iniciar."
  exit 1
fi
mascarado=$(echo "$url_migracao" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#')
echo "[entrada] Destino da migração: $mascarado"
# Até aproximadamente 2 minutos de espera para a rede e o banco iniciarem.
i=1
maximo_tentativas=20
while [ "$i" -le "$maximo_tentativas" ]; do
  if node ./docker/app/migrar.mjs; then
    break
  else
    codigo=$?
    if [ "$codigo" -ne 2 ]; then
      exit "$codigo"
    fi
  fi
  if [ "$i" -eq "$maximo_tentativas" ]; then
    echo "[entrada] Banco indisponível após ${maximo_tentativas} tentativas."
    exit 1
  fi
  sleep 2
  i=$((i + 1))
done

echo "[entrada] Iniciando o servidor..."
exec node server.js
