# PostgreSQL Flexible Server. O dono do schema é a própria conexão de runtime,
# sem papel separado: DATABASE_URL e DIRECT_URL usam o mesmo administrador.

ephemeral "random_password" "banco" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "banco" {
  name                = "${local.nome_base}-pg"
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  version             = var.versao_postgres
  sku_name            = var.sku_banco
  storage_mb          = var.tamanho_disco_banco_mb

  administrator_login               = "frequencia"
  administrator_password            = var.modo_local ? var.senha_banco_local : null
  administrator_password_wo         = var.modo_local ? null : ephemeral.random_password.banco.result
  administrator_password_wo_version = var.modo_local ? null : var.versao_segredos

  backup_retention_days        = local.retencao_backup
  geo_redundant_backup_enabled = var.modo_local ? false : var.habilitar_geo_backup

  public_network_access_enabled = local.permitir_rede_publica_banco

  delegated_subnet_id = var.modo_local || !var.habilitar_rede_privada ? null : azurerm_subnet.banco[0].id
  private_dns_zone_id = var.modo_local || !var.habilitar_rede_privada ? null : azurerm_private_dns_zone.postgres[0].id

  dynamic "high_availability" {
    for_each = var.modo_local || !var.habilitar_alta_disponibilidade_banco ? [] : [1]

    content {
      mode = "ZoneRedundant"
    }
  }

  tags = local.tags
}

resource "azurerm_postgresql_flexible_server_database" "frequencia" {
  name      = "frequencia"
  server_id = azurerm_postgresql_flexible_server.banco.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "local" {
  count = var.modo_local ? 1 : 0

  name             = "permitir-local"
  server_id        = azurerm_postgresql_flexible_server.banco.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
