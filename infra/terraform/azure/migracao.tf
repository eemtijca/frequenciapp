# Job manual separado do App Service, com identidade restrita à credencial migradora.
variable "ambiente_job_migracao_id" {
  description = "Environment Container Apps com rede privada aprovada para o banco; não criado implicitamente."
  type        = string
  default     = null
}
resource "azurerm_user_assigned_identity" "migracao" {
  count               = var.modo_local ? 0 : 1
  name                = "${local.nome_base}-migracao"
  location            = azurerm_resource_group.principal.location
  resource_group_name = azurerm_resource_group.principal.name
}
resource "azurerm_role_assignment" "migracao_segredo" {
  count                = var.modo_local ? 0 : 1
  scope                = azurerm_key_vault_secret.direct_url[0].resource_versionless_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.migracao[0].principal_id
}
resource "azurerm_role_assignment" "migracao_acr" {
  count                = var.modo_local ? 0 : 1
  scope                = azurerm_container_registry.principal[0].id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.migracao[0].principal_id
}
resource "azurerm_container_app_job" "migracao" {
  count = var.modo_local ? 0 : 1

  name                         = "${local.nome_base}-migrar"
  location                     = azurerm_resource_group.principal.location
  resource_group_name          = azurerm_resource_group.principal.name
  container_app_environment_id = var.modo_local ? azurerm_container_app_environment.local[0].id : var.ambiente_job_migracao_id
  replica_timeout_in_seconds   = 900
  replica_retry_limit          = 0
  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }
  dynamic "identity" {
    for_each = var.modo_local ? [] : [1]
    content {
      type         = "UserAssigned"
      identity_ids = [azurerm_user_assigned_identity.migracao[0].id]
    }
  }
  secret {
    name                = "direct-url"
    value               = var.modo_local ? local.url_migracao_efetiva : null
    key_vault_secret_id = var.modo_local ? null : azurerm_key_vault_secret.direct_url[0].versionless_id
    identity            = var.modo_local ? null : azurerm_user_assigned_identity.migracao[0].id
  }
  dynamic "registry" {
    for_each = var.modo_local ? [] : [1]
    content {
      server   = azurerm_container_registry.principal[0].login_server
      identity = azurerm_user_assigned_identity.migracao[0].id
    }
  }
  template {
    container {
      name    = "migrar"
      image   = var.imagem_aplicacao
      command = ["node"]
      args    = ["docker/app/migrar.mjs"]
      cpu     = 0.5
      memory  = "1Gi"
      env {
        name        = "DIRECT_URL"
        secret_name = "direct-url"
      }
      env {
        name  = "DATABASE_SCHEMA"
        value = local.schema_aplicacao_efetiva
      }
      env {
        name  = "COMMIT_SHA"
        value = var.revisao_aplicacao
      }
    }
  }
  lifecycle {
    precondition {
      condition     = local.runtime_configurado && (var.modo_local || var.ambiente_job_migracao_id != null)
      error_message = "Provisionar papéis e rede do job antes da migração. Criar o job não atesta sua execução."
    }
    ignore_changes = [secret]
  }
  depends_on = [azurerm_role_assignment.migracao_segredo, azurerm_role_assignment.migracao_acr]
}
