#!/usr/bin/env bash
# Carrega o ambiente dos CLIs de nuvem para o Floci, com diretórios isolados por execução.
# Uso: . scripts/cloud/floci-ambiente.sh; floci_carregar_tudo

FLOCI_BIN="${FLOCI_BIN:-floci}"
FLOCI_ESTADO="${FLOCI_ESTADO:-${HOME}/.floci}"
FLOCI_AWS_ENDPOINT="${FLOCI_AWS_ENDPOINT:-http://localhost.floci.io:4566}"
FLOCI_GCP_ENDPOINT="${FLOCI_GCP_ENDPOINT:-http://localhost:4588}"
FLOCI_AZ_ENDPOINT="${FLOCI_AZ_ENDPOINT:-https://localhost:4577}"
FLOCI_USAR_CLI="${FLOCI_USAR_CLI:-auto}"

floci_erro() {
  printf 'ERRO: %s\n' "$*" >&2
  return 1
}

floci_tem_cli() {
  [ "$FLOCI_USAR_CLI" != "0" ] && command -v "$FLOCI_BIN" >/dev/null 2>&1
}

# Lê um campo de um objeto JSON recebido pela entrada padrão.
floci_json_campo() {
  local campo="$1"
  node -e '
    let dados = "";
    process.stdin.on("data", (parte) => { dados += parte; });
    process.stdin.on("end", () => {
      const objeto = JSON.parse(dados);
      const valor = objeto[process.argv[1]];
      if (valor === undefined || valor === null || valor === "") process.exit(3);
      process.stdout.write(String(valor));
    });
  ' "$campo"
}

floci_carregar_aws() {
  local saida
  if floci_tem_cli; then
    saida="$("$FLOCI_BIN" env -o json)" || return 1
    AWS_ENDPOINT_URL="$(printf '%s' "$saida" | floci_json_campo AWS_ENDPOINT_URL)" || return 1
    AWS_ACCESS_KEY_ID="$(printf '%s' "$saida" | floci_json_campo AWS_ACCESS_KEY_ID)" || return 1
    AWS_SECRET_ACCESS_KEY="$(printf '%s' "$saida" | floci_json_campo AWS_SECRET_ACCESS_KEY)" || return 1
    AWS_DEFAULT_REGION="$(printf '%s' "$saida" | floci_json_campo AWS_DEFAULT_REGION)" || return 1
  else
    AWS_ENDPOINT_URL="$FLOCI_AWS_ENDPOINT"
    AWS_ACCESS_KEY_ID="test"
    AWS_SECRET_ACCESS_KEY="test"
    AWS_DEFAULT_REGION="us-east-1"
  fi
  export AWS_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
  unset AWS_PROFILE AWS_SESSION_TOKEN AWS_CONFIG_FILE AWS_SHARED_CREDENTIALS_FILE
}

floci_carregar_gcp() {
  local saida
  if floci_tem_cli; then
    saida="$("$FLOCI_BIN" gcp env -o json)" || return 1
    STORAGE_EMULATOR_HOST="$(printf '%s' "$saida" | floci_json_campo STORAGE_EMULATOR_HOST)" || return 1
    PUBSUB_EMULATOR_HOST="$(printf '%s' "$saida" | floci_json_campo PUBSUB_EMULATOR_HOST)" || return 1
    FIRESTORE_EMULATOR_HOST="$(printf '%s' "$saida" | floci_json_campo FIRESTORE_EMULATOR_HOST)" || return 1
    DATASTORE_EMULATOR_HOST="$(printf '%s' "$saida" | floci_json_campo DATASTORE_EMULATOR_HOST)" || return 1
    SECRET_MANAGER_EMULATOR_HOST="$(printf '%s' "$saida" | floci_json_campo SECRET_MANAGER_EMULATOR_HOST)" || return 1
  else
    STORAGE_EMULATOR_HOST="$FLOCI_GCP_ENDPOINT"
    PUBSUB_EMULATOR_HOST="localhost:4588"
    FIRESTORE_EMULATOR_HOST="localhost:4588"
    DATASTORE_EMULATOR_HOST="localhost:4588"
    SECRET_MANAGER_EMULATOR_HOST="localhost:4588"
  fi
  CLOUDSDK_CONFIG="${FLOCI_ESTADO}/gcp/gcloud"
  mkdir -p "$CLOUDSDK_CONFIG"
  CLOUDSDK_CORE_PROJECT="floci-local"
  CLOUDSDK_CORE_ACCOUNT="floci@local"
  CLOUDSDK_AUTH_ACCESS_TOKEN="${CLOUDSDK_AUTH_ACCESS_TOKEN:-floci-fake-token}"
  CLOUDSDK_CORE_DISABLE_PROMPTS="1"
  CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK="1"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE="${FLOCI_GCP_ENDPOINT}/storage/v1/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_PUBSUB="${FLOCI_GCP_ENDPOINT}/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_SECRETMANAGER="${FLOCI_GCP_ENDPOINT}/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_IAM="${FLOCI_GCP_ENDPOINT}/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDRESOURCEMANAGER="${FLOCI_GCP_ENDPOINT}/v1/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_SERVICEUSAGE="${FLOCI_GCP_ENDPOINT}/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_RUN="${FLOCI_GCP_ENDPOINT}/v2/"
  CLOUDSDK_API_ENDPOINT_OVERRIDES_SQL="${FLOCI_GCP_ENDPOINT}/sql/v1beta4/"
  export STORAGE_EMULATOR_HOST PUBSUB_EMULATOR_HOST FIRESTORE_EMULATOR_HOST
  export DATASTORE_EMULATOR_HOST SECRET_MANAGER_EMULATOR_HOST CLOUDSDK_CONFIG
  export CLOUDSDK_CORE_PROJECT CLOUDSDK_CORE_ACCOUNT CLOUDSDK_AUTH_ACCESS_TOKEN
  export CLOUDSDK_CORE_DISABLE_PROMPTS CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK
  export CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE CLOUDSDK_API_ENDPOINT_OVERRIDES_PUBSUB
  export CLOUDSDK_API_ENDPOINT_OVERRIDES_SECRETMANAGER CLOUDSDK_API_ENDPOINT_OVERRIDES_IAM
  export CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDRESOURCEMANAGER
  export CLOUDSDK_API_ENDPOINT_OVERRIDES_SERVICEUSAGE CLOUDSDK_API_ENDPOINT_OVERRIDES_RUN
  export CLOUDSDK_API_ENDPOINT_OVERRIDES_SQL
  unset GOOGLE_APPLICATION_CREDENTIALS GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_QUOTA_PROJECT
  unset GCLOUD_PROJECT
}

floci_carregar_azure() {
  local saida
  if floci_tem_cli; then
    saida="$("$FLOCI_BIN" az env -o json)" || return 1
    AZURE_STORAGE_CONNECTION_STRING="$(printf '%s' "$saida" | floci_json_campo AZURE_STORAGE_CONNECTION_STRING)" || return 1
    AZURE_CONFIG_DIR="$(printf '%s' "$saida" | floci_json_campo AZURE_CONFIG_DIR 2>/dev/null || true)"
    REQUESTS_CA_BUNDLE="$(printf '%s' "$saida" | floci_json_campo REQUESTS_CA_BUNDLE 2>/dev/null || true)"
  else
    AZURE_STORAGE_CONNECTION_STRING="${AZURE_STORAGE_CONNECTION_STRING:-}"
  fi
  AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-${FLOCI_ESTADO}/az/floci-az/azure-config}"
  REQUESTS_CA_BUNDLE="${REQUESTS_CA_BUNDLE:-${FLOCI_ESTADO}/az/floci-az/ca-bundle.pem}"
  export AZURE_STORAGE_CONNECTION_STRING AZURE_CONFIG_DIR REQUESTS_CA_BUNDLE
  unset AZURE_SUBSCRIPTION_ID AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET
}

floci_carregar_tudo() {
  floci_carregar_aws || return 1
  floci_carregar_gcp || return 1
  floci_carregar_azure || return 1
}

floci_verificar_endpoints() {
  curl -fsS --max-time 5 "${FLOCI_AWS_ENDPOINT}/health" >/dev/null ||
    floci_erro "Floci AWS não responde em ${FLOCI_AWS_ENDPOINT}." || return 1
  curl -fsS --max-time 5 "${FLOCI_GCP_ENDPOINT}/health" >/dev/null ||
    floci_erro "Floci GCP não responde em ${FLOCI_GCP_ENDPOINT}." || return 1
  curl -kfsS --max-time 5 "${FLOCI_AZ_ENDPOINT}/health" >/dev/null ||
    floci_erro "Floci Azure não responde em ${FLOCI_AZ_ENDPOINT}." || return 1
}

floci_verificar_identidade() {
  if command -v az >/dev/null 2>&1; then
    local nuvem
    nuvem="$(az cloud show --query name -o tsv 2>/dev/null || true)"
    [ "$nuvem" = "floci-az" ] ||
      floci_erro "O Azure CLI não aponta para o Floci. Execute: floci az setup" || return 1
  fi
  if command -v gcloud >/dev/null 2>&1; then
    local projeto conta
    projeto="$(gcloud config get-value project 2>/dev/null || true)"
    conta="$(gcloud config get-value account 2>/dev/null || true)"
    [ "$projeto" = "floci-local" ] ||
      floci_erro "O gcloud não usa o projeto floci-local." || return 1
    [ "$conta" = "floci@local" ] ||
      floci_erro "O gcloud não usa a conta sintética floci@local." || return 1
  fi
}

floci_verificar_sem_credencial_real() {
  [ -z "${AWS_PROFILE:-}" ] || floci_erro "AWS_PROFILE não pode ser usada com o Floci." || return 1
  [ "${AWS_ACCESS_KEY_ID:-}" = "test" ] ||
    floci_erro "AWS_ACCESS_KEY_ID precisa ser test." || return 1
  [ "${AWS_SECRET_ACCESS_KEY:-}" = "test" ] ||
    floci_erro "AWS_SECRET_ACCESS_KEY precisa ser test." || return 1
  case "${AWS_ENDPOINT_URL:-}" in
    http://localhost*|http://127.0.0.1*|http://host.docker.internal*) ;;
    *) floci_erro "AWS_ENDPOINT_URL não aponta para o Floci." || return 1 ;;
  esac
  case "${CLOUDSDK_CONFIG:-}" in
    "${FLOCI_ESTADO}"/*) ;;
    *) floci_erro "CLOUDSDK_CONFIG precisa ficar sob ${FLOCI_ESTADO}." || return 1 ;;
  esac
  [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] ||
    floci_erro "GOOGLE_APPLICATION_CREDENTIALS real não pode ser usada." || return 1
  case "${AZURE_CONFIG_DIR:-}" in
    "${FLOCI_ESTADO}"/*) ;;
    *) floci_erro "AZURE_CONFIG_DIR precisa ficar sob ${FLOCI_ESTADO}." || return 1 ;;
  esac
}
