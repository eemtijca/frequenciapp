# Executa o AWS CLI contra o Floci no PowerShell, recusando argumentos de nuvem real.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'floci-ambiente.ps1')

Import-FlociAws
Test-FlociEndpoints

foreach ($argumento in $args) {
  if ($argumento -match 'amazonaws\.com|azure\.com|googleapis\.com') {
    throw "Argumento de nuvem real recusado: $argumento"
  }
}

& aws --endpoint-url $env:AWS_ENDPOINT_URL @args
exit $LASTEXITCODE
