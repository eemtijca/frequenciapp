# Confere se DATABASE_URL e DIRECT_URL apontam para um banco local descartavel.
$ErrorActionPreference = 'Stop'

function Get-CampoUrl {
  param([string]$Url, [string]$Campo)
  $uri = [System.Uri]$Url
  switch ($Campo) {
    'host' { return $uri.Host }
    'porta' { if ($uri.Port -gt 0) { return [string]$uri.Port } else { return '5432' } }
    'banco' { return $uri.AbsolutePath.TrimStart('/') }
    default { throw "Campo desconhecido: $Campo" }
  }
}

function Test-UrlDescartavel {
  param([string]$Nome, [string]$Url)
  if (-not $Url) { throw "$Nome nao definida." }
  $servidor = Get-CampoUrl -Url $Url -Campo host
  $porta = Get-CampoUrl -Url $Url -Campo porta
  $banco = Get-CampoUrl -Url $Url -Campo banco
  if ($servidor -notin @('localhost', '127.0.0.1', '::1', 'host.docker.internal')) {
    throw "$Nome aponta para host nao local: $servidor."
  }
  if ($banco -in @('frequencia', 'postgres', 'template0', 'template1', 'production', 'prod')) {
    throw "$Nome aponta para banco nao descartavel: $banco."
  }
  if ($banco -notmatch '^(qa[_-]|test[_-]|e2e[_-]|floci[_-])') {
    if ($env:PERMITIR_BANCO_LOCAL -ne 'true') {
      throw "$Nome precisa usar banco com prefixo qa_, test_, e2e_ ou floci_."
    }
  }
  return "$servidor`:$porta/$banco"
}

$destino = Test-UrlDescartavel -Nome 'DATABASE_URL' -Url $env:DATABASE_URL
if ($env:DIRECT_URL) {
  $direto = Test-UrlDescartavel -Nome 'DIRECT_URL' -Url $env:DIRECT_URL
  if ($destino -ne $direto) {
    throw 'DIRECT_URL e DATABASE_URL precisam apontar para o mesmo host, porta e banco.'
  }
}
Write-Output "Banco descartavel confirmado: $destino"
