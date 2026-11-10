# Carrega o ambiente dos CLIs de nuvem para o Floci no PowerShell, com diretórios isolados.
# Uso: . .\scripts\cloud\floci-ambiente.ps1; Import-FlociTudo

$script:FlociEstado = if ($env:FLOCI_ESTADO) { $env:FLOCI_ESTADO } else { Join-Path $env:USERPROFILE '.floci' }
$script:FlociAwsEndpoint = if ($env:FLOCI_AWS_ENDPOINT) { $env:FLOCI_AWS_ENDPOINT } else { 'http://localhost.floci.io:4566' }
$script:FlociGcpEndpoint = if ($env:FLOCI_GCP_ENDPOINT) { $env:FLOCI_GCP_ENDPOINT } else { 'http://localhost:4588' }
$script:FlociAzEndpoint = if ($env:FLOCI_AZ_ENDPOINT) { $env:FLOCI_AZ_ENDPOINT } else { 'https://localhost:4577' }

function Test-FlociCli {
  return [bool](Get-Command floci -ErrorAction SilentlyContinue)
}

function Import-FlociAws {
  if (Test-FlociCli) {
    $dados = floci env -o json | ConvertFrom-Json
    $env:AWS_ENDPOINT_URL = $dados.AWS_ENDPOINT_URL
    $env:AWS_ACCESS_KEY_ID = $dados.AWS_ACCESS_KEY_ID
    $env:AWS_SECRET_ACCESS_KEY = $dados.AWS_SECRET_ACCESS_KEY
    $env:AWS_DEFAULT_REGION = $dados.AWS_DEFAULT_REGION
  } else {
    $env:AWS_ENDPOINT_URL = $script:FlociAwsEndpoint
    $env:AWS_ACCESS_KEY_ID = 'test'
    $env:AWS_SECRET_ACCESS_KEY = 'test'
    $env:AWS_DEFAULT_REGION = 'us-east-1'
  }
  Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_CONFIG_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:AWS_SHARED_CREDENTIALS_FILE -ErrorAction SilentlyContinue
}

function Import-FlociGcp {
  if (Test-FlociCli) {
    $dados = floci gcp env -o json | ConvertFrom-Json
    $env:STORAGE_EMULATOR_HOST = $dados.STORAGE_EMULATOR_HOST
    $env:PUBSUB_EMULATOR_HOST = $dados.PUBSUB_EMULATOR_HOST
    $env:FIRESTORE_EMULATOR_HOST = $dados.FIRESTORE_EMULATOR_HOST
    $env:DATASTORE_EMULATOR_HOST = $dados.DATASTORE_EMULATOR_HOST
    $env:SECRET_MANAGER_EMULATOR_HOST = $dados.SECRET_MANAGER_EMULATOR_HOST
  } else {
    $env:STORAGE_EMULATOR_HOST = $script:FlociGcpEndpoint
    $env:PUBSUB_EMULATOR_HOST = 'localhost:4588'
    $env:FIRESTORE_EMULATOR_HOST = 'localhost:4588'
    $env:DATASTORE_EMULATOR_HOST = 'localhost:4588'
    $env:SECRET_MANAGER_EMULATOR_HOST = 'localhost:4588'
  }
  $env:CLOUDSDK_CONFIG = Join-Path $script:FlociEstado 'gcp\gcloud'
  New-Item -ItemType Directory -Force -Path $env:CLOUDSDK_CONFIG | Out-Null
  $env:CLOUDSDK_CORE_PROJECT = 'floci-local'
  $env:CLOUDSDK_CORE_ACCOUNT = 'floci@local'
  if (-not $env:CLOUDSDK_AUTH_ACCESS_TOKEN) { $env:CLOUDSDK_AUTH_ACCESS_TOKEN = 'floci-fake-token' }
  $env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'
  $env:CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK = '1'
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE = "$script:FlociGcpEndpoint/storage/v1/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_PUBSUB = "$script:FlociGcpEndpoint/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_SECRETMANAGER = "$script:FlociGcpEndpoint/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_IAM = "$script:FlociGcpEndpoint/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDRESOURCEMANAGER = "$script:FlociGcpEndpoint/v1/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_SERVICEUSAGE = "$script:FlociGcpEndpoint/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_RUN = "$script:FlociGcpEndpoint/v2/"
  $env:CLOUDSDK_API_ENDPOINT_OVERRIDES_SQL = "$script:FlociGcpEndpoint/sql/v1beta4/"
  Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
  Remove-Item Env:GOOGLE_CLOUD_PROJECT -ErrorAction SilentlyContinue
  Remove-Item Env:GOOGLE_CLOUD_QUOTA_PROJECT -ErrorAction SilentlyContinue
  Remove-Item Env:GCLOUD_PROJECT -ErrorAction SilentlyContinue
}

function Import-FlociAzure {
  if (Test-FlociCli) {
    $dados = floci az env -o json | ConvertFrom-Json
    if ($dados.AZURE_STORAGE_CONNECTION_STRING) { $env:AZURE_STORAGE_CONNECTION_STRING = $dados.AZURE_STORAGE_CONNECTION_STRING }
    if ($dados.AZURE_CONFIG_DIR) { $env:AZURE_CONFIG_DIR = $dados.AZURE_CONFIG_DIR }
    if ($dados.REQUESTS_CA_BUNDLE) { $env:REQUESTS_CA_BUNDLE = $dados.REQUESTS_CA_BUNDLE }
  }
  if (-not $env:AZURE_CONFIG_DIR) { $env:AZURE_CONFIG_DIR = Join-Path $script:FlociEstado 'az\floci-az\azure-config' }
  if (-not $env:REQUESTS_CA_BUNDLE) { $env:REQUESTS_CA_BUNDLE = Join-Path $script:FlociEstado 'az\floci-az\ca-bundle.pem' }
  Remove-Item Env:AZURE_SUBSCRIPTION_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AZURE_TENANT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AZURE_CLIENT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AZURE_CLIENT_SECRET -ErrorAction SilentlyContinue
}

function Import-FlociTudo {
  Import-FlociAws
  Import-FlociGcp
  Import-FlociAzure
}

function Test-FlociEndpoints {
  & curl.exe -fsS --max-time 5 "$script:FlociAwsEndpoint/health" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Floci AWS nao responde em $script:FlociAwsEndpoint." }
  & curl.exe -fsS --max-time 5 "$script:FlociGcpEndpoint/health" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Floci GCP nao responde em $script:FlociGcpEndpoint." }
  & curl.exe -kfsS --max-time 5 "$script:FlociAzEndpoint/health" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Floci Azure nao responde em $script:FlociAzEndpoint." }
}

function Test-FlociIdentidade {
  if (Get-Command az -ErrorAction SilentlyContinue) {
    $nuvem = (& az cloud show --query name -o tsv 2>$null | Out-String).Trim()
    if ($nuvem -ne 'floci-az') { throw "O Azure CLI nao aponta para o Floci. Execute: floci az setup" }
  }
  if (Get-Command gcloud -ErrorAction SilentlyContinue) {
    $projeto = (& gcloud config get-value project 2>$null | Out-String).Trim()
    $conta = (& gcloud config get-value account 2>$null | Out-String).Trim()
    if ($projeto -ne 'floci-local') { throw "O gcloud nao usa o projeto floci-local." }
    if ($conta -ne 'floci@local') { throw "O gcloud nao usa a conta sintetica floci@local." }
  }
}

function Test-FlociSemCredencialReal {
  if ($env:AWS_PROFILE) { throw "AWS_PROFILE nao pode ser usada com o Floci." }
  if ($env:AWS_ACCESS_KEY_ID -ne 'test') { throw "AWS_ACCESS_KEY_ID precisa ser test." }
  if ($env:AWS_SECRET_ACCESS_KEY -ne 'test') { throw "AWS_SECRET_ACCESS_KEY precisa ser test." }
  if ($env:AWS_ENDPOINT_URL -notmatch '^http://(localhost|127\.0\.0\.1|localhost\.floci\.io)') {
    throw "AWS_ENDPOINT_URL nao aponta para o Floci."
  }
  if (-not $env:CLOUDSDK_CONFIG.StartsWith((Join-Path $script:FlociEstado ''))) {
    throw "CLOUDSDK_CONFIG precisa ficar sob $script:FlociEstado."
  }
  if ($env:GOOGLE_APPLICATION_CREDENTIALS) { throw "GOOGLE_APPLICATION_CREDENTIALS real nao pode ser usada." }
  if (-not $env:AZURE_CONFIG_DIR.StartsWith((Join-Path $script:FlociEstado ''))) {
    throw "AZURE_CONFIG_DIR precisa ficar sob $script:FlociEstado."
  }
}
