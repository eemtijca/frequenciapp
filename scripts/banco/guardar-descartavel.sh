#!/usr/bin/env bash
# Confere se DATABASE_URL e DIRECT_URL apontam para um banco local descartável.
set -Eeuo pipefail

erro() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

campo_url() {
  local url="$1"
  local campo="$2"
  node -e '
    const url = new URL(process.argv[1]);
    const campo = process.argv[2];
    const valores = {
      host: url.hostname,
      porta: url.port || "5432",
      banco: url.pathname.replace(/^\//, ""),
    };
    process.stdout.write(String(valores[campo] ?? ""));
  ' "$url" "$campo"
}

validar_url() {
  local nome="$1"
  local url="$2"
  [ -n "$url" ] || erro "$nome não definida."
  local host porta banco
  host="$(campo_url "$url" host)" || erro "$nome inválida."
  porta="$(campo_url "$url" porta)" || erro "$nome inválida."
  banco="$(campo_url "$url" banco)" || erro "$nome inválida."
  case "$host" in
    localhost|127.0.0.1|::1|host.docker.internal) ;;
    *) erro "$nome aponta para host não local: $host." ;;
  esac
  case "$banco" in
    qa_*|qa-*|test_*|test-*|e2e_*|e2e-*|floci_*|floci-*) ;;
    frequencia|postgres|template0|template1|production|prod)
      erro "$nome aponta para banco não descartável: $banco."
      ;;
    *)
      if [ "${PERMITIR_BANCO_LOCAL:-false}" != "true" ]; then
        erro "$nome precisa usar banco com prefixo qa_, test_, e2e_ ou floci_."
      fi
      ;;
  esac
  printf '%s:%s/%s' "$host" "$porta" "$banco"
}

[ -n "${DATABASE_URL:-}" ] || erro "DATABASE_URL não definida."
destino="$(validar_url DATABASE_URL "$DATABASE_URL")"

if [ -n "${DIRECT_URL:-}" ]; then
  direto="$(validar_url DIRECT_URL "$DIRECT_URL")"
  [ "$destino" = "$direto" ] ||
    erro "DIRECT_URL e DATABASE_URL precisam apontar para o mesmo host, porta e banco."
fi

printf 'Banco descartável confirmado: %s\n' "$destino"
