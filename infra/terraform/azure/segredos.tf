# Cofre de segredos e as credenciais da aplicação. O Key Vault é usado apenas
# pelo caminho de produção; no modo local o Container Apps recebe variáveis de
# desenvolvimento e o emulador não responde ao data plane do cofre.

data "azurerm_client_config" "atual" {}

resource "azurerm_key_vault" "principal" {
  count = var.modo_local ? 0 : 1

  name                = local.nome_kv
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  tenant_id           = data.azurerm_client_config.atual.tenant_id
  sku_name            = "standard"

  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 7

  tags = local.tags
}

resource "azurerm_key_vault_secret" "database_url" {
  count = var.modo_local ? 0 : 1

  name             = "database-url"
  key_vault_id     = azurerm_key_vault.principal[0].id
  value_wo         = local.url_banco_producao
  value_wo_version = var.versao_segredos
}

resource "azurerm_key_vault_secret" "direct_url" {
  count = var.modo_local ? 0 : 1

  name             = "direct-url"
  key_vault_id     = azurerm_key_vault.principal[0].id
  value_wo         = local.url_banco_producao
  value_wo_version = var.versao_segredos
}

resource "azurerm_key_vault_secret" "auth_secret" {
  count = var.modo_local ? 0 : 1

  name             = "auth-secret"
  key_vault_id     = azurerm_key_vault.principal[0].id
  value_wo         = ephemeral.random_password.auth_secret.result
  value_wo_version = var.versao_segredos
}

resource "azurerm_key_vault_secret" "cron_secret" {
  count = var.modo_local ? 0 : 1

  name             = "cron-secret"
  key_vault_id     = azurerm_key_vault.principal[0].id
  value_wo         = ephemeral.random_password.cron.result
  value_wo_version = var.versao_segredos
}

ephemeral "random_password" "auth_secret" {
  length  = 48
  special = false
}

ephemeral "random_password" "cron" {
  length  = 48
  special = false
}
