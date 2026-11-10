# Executa o gcloud contra o Floci no PowerShell, recusando argumentos de nuvem real.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'floci-ambiente.ps1')

Import-FlociGcp
Test-FlociEndpoints

foreach ($argumento in $args) {
  if ($argumento -match 'googleapis\.com|amazonaws\.com|management\.azure\.com') {
    throw "Argumento de nuvem real recusado: $argumento"
  }
}

& gcloud @args
exit $LASTEXITCODE
