#!/bin/sh
# Ponto de entrada do contêiner da aplicação.
# Aguarda o banco, aplica as migrações e inicia o servidor.
set -eu

echo "[entrada] Aguardando o banco..."
# O endereço é mascarado para não expor a senha nos logs.
mascarado=$(echo "$DATABASE_URL" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#')
echo "[entrada] Destino: $mascarado"
# Até 120 s de espera (60 tentativas de 2 s).
i=1
while [ "$i" -le 60 ]; do
  if node ./docker/app/migrar.mjs; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[entrada] Banco indisponível após 60 tentativas."
    exit 1
  fi
  sleep 2
  i=$((i + 1))
done

echo "[entrada] Iniciando o servidor..."
exec node server.js
