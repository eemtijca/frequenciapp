# Executa um smoke test minimo dos tres CLIs contra o Floci, com dados sinteticos.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'floci-ambiente.ps1')

$prefixo = "qa-cloud-$(Get-Date -Format 'yyyyMMddHHmmss')-$PID"
$temporario = New-TemporaryFile
$awsCriado = $false
$azureCriado = $false
$gcpCriado = $false
$topicoCriado = $false

try {
  Import-FlociTudo
  Test-FlociEndpoints
  Test-FlociIdentidade
  Test-FlociSemCredencialReal

  Write-Output "Smoke AWS: $prefixo"
  & aws sts get-caller-identity --endpoint-url $env:AWS_ENDPOINT_URL | Out-Null
  & aws s3 mb "s3://$prefixo" --endpoint-url $env:AWS_ENDPOINT_URL | Out-Null
  $awsCriado = $true
  'hello floci' | & aws s3 cp - "s3://$prefixo/hello.txt" --endpoint-url $env:AWS_ENDPOINT_URL | Out-Null
  & aws s3 ls "s3://$prefixo" --endpoint-url $env:AWS_ENDPOINT_URL | Out-Null

  Write-Output "Smoke Azure: $prefixo"
  $nuvem = (& az cloud show --query name -o tsv | Out-String).Trim()
  if ($nuvem -ne 'floci-az') { throw 'Execute floci az setup antes do smoke.' }
  & az group create -n $prefixo -l westeurope | Out-Null
  $azureCriado = $true
  & az group show -n $prefixo | Out-Null
  & az storage container create --name $prefixo | Out-Null

  Write-Output "Smoke GCP: $prefixo"
  Set-Content -Path $temporario -Value 'hello floci'
  & gcloud storage buckets create "gs://$prefixo" | Out-Null
  $gcpCriado = $true
  & gcloud storage cp $temporario "gs://$prefixo/hello.txt" | Out-Null
  & gcloud storage ls "gs://$prefixo" | Out-Null
  & gcloud storage cat "gs://$prefixo/hello.txt" | Out-Null
  & gcloud pubsub topics create $prefixo | Out-Null
  $topicoCriado = $true
  & gcloud pubsub topics list | Out-Null

  Write-Output 'Smoke concluido: AWS, Azure e GCP responderam pelo Floci.'
} finally {
  $ErrorActionPreference = 'SilentlyContinue'
  try { if ($awsCriado) { & aws s3 rb "s3://$prefixo" --force --endpoint-url $env:AWS_ENDPOINT_URL 2>&1 | Out-Null } } catch {}
  try { if ($azureCriado) { & az group delete -n $prefixo --yes --no-wait 2>&1 | Out-Null } } catch {}
  try { if ($gcpCriado) { & gcloud storage rm -r "gs://$prefixo" 2>&1 | Out-Null } } catch {}
  try { if ($gcpCriado) { & gcloud storage buckets delete "gs://$prefixo" 2>&1 | Out-Null } } catch {}
  try { if ($topicoCriado) { & gcloud pubsub topics delete $prefixo 2>&1 | Out-Null } } catch {}
  Remove-Item $temporario -Force -ErrorAction SilentlyContinue
}
