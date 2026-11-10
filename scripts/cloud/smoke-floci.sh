#!/usr/bin/env bash
# Executa um smoke test mínimo dos três CLIs contra o Floci, com dados sintéticos.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
. "$RAIZ/scripts/cloud/floci-ambiente.sh"

prefixo="qa-cloud-$(date -u +%Y%m%d%H%M%S)-$$"
temporario="$(mktemp)"
aws_criado=false
azure_criado=false
gcp_criado=false
topico_criado=false

limpar() {
  if [ "$aws_criado" = true ]; then
    aws s3 rb "s3://$prefixo" --force --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null 2>&1 || true
  fi
  if [ "$azure_criado" = true ]; then
    az group delete -n "$prefixo" --yes --no-wait >/dev/null 2>&1 || true
  fi
  if [ "$gcp_criado" = true ]; then
    gcloud storage rm -r "gs://$prefixo" >/dev/null 2>&1 || true
    gcloud storage buckets delete "gs://$prefixo" >/dev/null 2>&1 || true
  fi
  if [ "$topico_criado" = true ]; then
    gcloud pubsub topics delete "$prefixo" >/dev/null 2>&1 || true
  fi
  rm -f "$temporario"
}
trap limpar EXIT

floci_carregar_tudo
floci_verificar_endpoints
floci_verificar_identidade
floci_verificar_sem_credencial_real

printf 'Smoke AWS: %s\n' "$prefixo"
aws sts get-caller-identity --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null
aws s3 mb "s3://$prefixo" --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null
aws_criado=true
printf 'hello floci\n' | aws s3 cp - "s3://$prefixo/hello.txt" --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null
aws s3 ls "s3://$prefixo" --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null

printf 'Smoke Azure: %s\n' "$prefixo"
if ! az cloud show --query name -o tsv | grep -qx 'floci-az'; then
  printf 'ERRO: execute floci az setup antes do smoke.\n' >&2
  exit 1
fi
az group create -n "$prefixo" -l westeurope >/dev/null
azure_criado=true
az group show -n "$prefixo" >/dev/null
az storage container create --name "$prefixo" >/dev/null

printf 'Smoke GCP: %s\n' "$prefixo"
printf 'hello floci\n' >"$temporario"
gcloud storage buckets create "gs://$prefixo" >/dev/null
gcp_criado=true
gcloud storage cp "$temporario" "gs://$prefixo/hello.txt" >/dev/null
gcloud storage ls "gs://$prefixo" >/dev/null
gcloud storage cat "gs://$prefixo/hello.txt" >/dev/null
gcloud pubsub topics create "$prefixo" >/dev/null
topico_criado=true
gcloud pubsub topics list >/dev/null

printf 'Smoke concluído: AWS, Azure e GCP responderam pelo Floci.\n'
