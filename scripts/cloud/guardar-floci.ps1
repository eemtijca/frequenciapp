# Confere se os CLIs e os endpoints de nuvem apontam exclusivamente para o Floci.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'floci-ambiente.ps1')

Import-FlociTudo
Test-FlociEndpoints
Test-FlociIdentidade
Test-FlociSemCredencialReal

if (Get-Command aws -ErrorAction SilentlyContinue) {
  & aws sts get-caller-identity --endpoint-url $env:AWS_ENDPOINT_URL | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "AWS CLI nao respondeu pelo Floci." }
}

Write-Output 'Floci confirmado: AWS, Azure e GCP locais, sem credenciais reais.'
