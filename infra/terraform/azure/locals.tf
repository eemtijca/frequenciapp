# Dados derivados e nomes padronizados dos recursos Azure.

resource "random_string" "sufixo" {
  length  = 4
  upper   = false
  special = false
  numeric = true
}

locals {
  nome_base = "${var.nome_aplicacao}-${var.ambiente}"

  # No modo local o endereço do PostgreSQL costuma ser o gateway do Docker com
  # a porta publicada; o nome devolvido pelo emulador não resolve na bridge.
  endereco_banco_local = var.endereco_banco_local != null ? var.endereco_banco_local : azurerm_postgresql_flexible_server.banco.fqdn

  nome_curto = lower(replace("${var.nome_aplicacao}${var.ambiente}", "-", ""))

  nome_acr = lower(replace("${local.nome_curto}acr", "-", ""))

  nome_kv = substr("${local.nome_base}-kv", 0, 24)

  tags = {
    Aplicacao     = var.nome_aplicacao
    Ambiente      = var.ambiente
    GerenciadoPor = "terraform"
  }

  # No modo local o firewall do emulador não tem efeito prático.
  permitir_rede_publica_banco = var.modo_local ? true : !var.habilitar_rede_privada

  retencao_backup = var.modo_local ? 7 : var.retencao_backup_dias

  # Credenciais previamente provisionadas; nunca derivar o runtime do administrador.
  url_runtime  = var.url_runtime
  url_migracao = var.url_migracao

  # O ensaio local é sintético e usa a credencial descartável do emulador; ele
  # não atesta a separação de papéis exigida em produção.
  url_banco_local = format(
    "postgresql://%s:%s@%s/frequencia",
    "frequencia",
    var.senha_banco_local,
    local.endereco_banco_local,
  )
  url_runtime_efetiva  = var.modo_local ? (var.url_runtime != null ? var.url_runtime : local.url_banco_local) : local.url_runtime
  url_migracao_efetiva = var.modo_local ? (var.url_migracao != null ? var.url_migracao : local.url_banco_local) : local.url_migracao
  # O schema exclusivo é pré-requisito de produção; o emulador usa o public,
  # que já existe, para o ciclo local não exigir provisionamento externo.
  schema_aplicacao_efetiva = var.modo_local && var.schema_aplicacao == "frequenciapp" ? "public" : var.schema_aplicacao

  url_aplicacao = var.modo_local ? "http://localhost:3000" : (
    var.dominio != null ? "https://${var.dominio}" : "https://${local.nome_base}-api.azurewebsites.net"
  )
}
