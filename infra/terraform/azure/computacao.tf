# Grupo de recursos e computação. Em produção o alvo é o App Service; no modo
# local o módulo usa Container Apps, que o floci-az emula.

resource "azurerm_resource_group" "principal" {
  name     = "${local.nome_base}-rg"
  location = var.localizacao

  tags = local.tags

  # O emulador não aceita PATCH no grupo de recursos e devolve as tags vazias,
  # o que criaria um drift falso.
  lifecycle {
    ignore_changes = [tags]
  }
}

resource "azurerm_service_plan" "api" {
  count = var.modo_local ? 0 : 1

  name                   = "${local.nome_base}-plano"
  resource_group_name    = azurerm_resource_group.principal.name
  location               = azurerm_resource_group.principal.location
  os_type                = "Linux"
  sku_name               = var.sku_app_service
  zone_balancing_enabled = var.habilitar_zona_redundante_app

  tags = local.tags
}

resource "azurerm_linux_web_app" "api" {
  count = var.modo_local ? 0 : 1

  name                = "${local.nome_base}-api"
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  service_plan_id     = azurerm_service_plan.api[0].id
  https_only          = true

  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false

  virtual_network_subnet_id = var.habilitar_rede_privada ? azurerm_subnet.app[0].id : null

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on                               = true
    health_check_path                       = "/api/saude"
    container_registry_use_managed_identity = true
    vnet_route_all_enabled                  = var.habilitar_rede_privada

    application_stack {
      docker_image_name   = var.imagem_aplicacao
      docker_registry_url = "https://${azurerm_container_registry.principal[0].login_server}"
    }
  }

  lifecycle {
    precondition {
      condition     = local.migracao_confirmada
      error_message = "Executar o job da mesma revisão e registrar o recibo antes de promover o runtime."
    }
  }

  app_settings = {
    MIGRAR_NA_PARTIDA = "false"
    DATABASE_SCHEMA   = local.schema_aplicacao_efetiva
    COMMIT_SHA        = var.revisao_aplicacao
    WEBSITES_PORT     = "3000"
    NODE_ENV          = "production"
    PORT              = "3000"
    HOST              = "0.0.0.0"
    TZ_APP            = var.tz_app
    PERMITIR_HTTP     = "false"
    DATABASE_URL      = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.database_url[0].versionless_id})"
    AUTH_SECRET       = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.auth_secret[0].versionless_id})"
    CRON_SECRET       = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault_secret.cron_secret[0].versionless_id})"
  }

  tags = local.tags
}

resource "azurerm_role_assignment" "app_acr_pull" {
  count = var.modo_local ? 0 : 1

  scope                = azurerm_container_registry.principal[0].id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.api[0].identity[0].principal_id
}

resource "azurerm_role_assignment" "app_kv_secrets" {
  for_each = var.modo_local ? {} : {
    banco = azurerm_key_vault_secret.database_url[0].resource_versionless_id
    auth  = azurerm_key_vault_secret.auth_secret[0].resource_versionless_id
    cron  = azurerm_key_vault_secret.cron_secret[0].resource_versionless_id
  }
  scope                = each.value
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.api[0].identity[0].principal_id
}

resource "azurerm_container_app_environment" "local" {
  count = var.modo_local ? 1 : 0

  name                       = "${local.nome_base}-env"
  resource_group_name        = azurerm_resource_group.principal.name
  location                   = azurerm_resource_group.principal.location
  log_analytics_workspace_id = var.modo_local ? null : azurerm_log_analytics_workspace.principal[0].id

  tags = local.tags
}

resource "azurerm_container_app" "local" {
  count = var.modo_local ? 1 : 0

  name                         = "${local.nome_base}-api"
  resource_group_name          = azurerm_resource_group.principal.name
  container_app_environment_id = azurerm_container_app_environment.local[0].id
  revision_mode                = "Single"
  lifecycle {
    precondition {
      condition     = local.migracao_confirmada
      error_message = "O serviço exige o contrato de runtime e a revisão confirmada."
    }
  }

  template {
    min_replicas    = 1
    max_replicas    = var.desired_count
    revision_suffix = var.sufixo_revisao

    container {
      name   = "api"
      image  = var.imagem_aplicacao
      cpu    = var.cpu_container_local
      memory = var.memoria_container_local

      env {
        name  = "MIGRAR_NA_PARTIDA"
        value = "false"
      }
      env {
        name  = "DATABASE_SCHEMA"
        value = local.schema_aplicacao_efetiva
      }
      env {
        name  = "COMMIT_SHA"
        value = var.revisao_aplicacao
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "TZ_APP"
        value = var.tz_app
      }

      env {
        name  = "PERMITIR_HTTP"
        value = "true"
      }

      env {
        name  = "DATABASE_URL"
        value = local.url_runtime_efetiva
      }

      env {
        name  = "AUTH_SECRET"
        value = var.auth_secret_local
      }

      env {
        name  = "CRON_SECRET"
        value = var.cron_secret_local
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  tags = local.tags
}
