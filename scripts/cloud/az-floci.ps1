# Executa o Azure CLI contra o Floci no PowerShell, recusando argumentos de nuvem real.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'floci-ambiente.ps1')

Import-FlociAzure
Test-FlociEndpoints
$nuvem = (& az cloud show --query name -o tsv 2>$null | Out-String).Trim()
if ($nuvem -ne 'floci-az') { throw 'Execute floci az setup antes de usar o Azure CLI.' }

foreach ($argumento in $args) {
  if ($argumento -match 'management\.azure\.com|login\.microsoftonline\.com|amazonaws\.com|googleapis\.com') {
    throw "Argumento de nuvem real recusado: $argumento"
  }
}

& az @args
exit $LASTEXITCODE
