# Segredos da aplicação. Em produção os valores nascem efêmeros e só chegam ao
# Secrets Manager; no modo local valem os valores de desenvolvimento. A
# DATABASE_URL e a DIRECT_URL usam o mesmo administrador do schema.

ephemeral "random_password" "banco" {
  length  = 32
  special = false
}

ephemeral "random_password" "auth_secret" {
  length  = 48
  special = false
}

ephemeral "random_password" "cron" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.nome_base}/database-url"
  recovery_window_in_days = var.modo_local ? 0 : null

  tags = merge(local.tags, { Name = "${local.nome_base}/database-url" })
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id                = aws_secretsmanager_secret.database_url.id
  secret_string            = var.modo_local ? local.url_banco_local : null
  secret_string_wo         = var.modo_local ? null : local.url_banco_producao
  secret_string_wo_version = var.modo_local ? null : var.versao_segredos
}

resource "aws_secretsmanager_secret" "direct_url" {
  name                    = "${local.nome_base}/direct-url"
  recovery_window_in_days = var.modo_local ? 0 : null

  tags = merge(local.tags, { Name = "${local.nome_base}/direct-url" })
}

resource "aws_secretsmanager_secret_version" "direct_url" {
  secret_id                = aws_secretsmanager_secret.direct_url.id
  secret_string            = var.modo_local ? local.url_banco_local : null
  secret_string_wo         = var.modo_local ? null : local.url_banco_producao
  secret_string_wo_version = var.modo_local ? null : var.versao_segredos
}

resource "aws_secretsmanager_secret" "auth_secret" {
  name                    = "${local.nome_base}/auth-secret"
  recovery_window_in_days = var.modo_local ? 0 : null

  tags = merge(local.tags, { Name = "${local.nome_base}/auth-secret" })
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id                = aws_secretsmanager_secret.auth_secret.id
  secret_string            = var.modo_local ? var.auth_secret_local : null
  secret_string_wo         = var.modo_local ? null : ephemeral.random_password.auth_secret.result
  secret_string_wo_version = var.modo_local ? null : var.versao_segredos
}

resource "aws_secretsmanager_secret" "cron" {
  name                    = "${local.nome_base}/cron-secret"
  recovery_window_in_days = var.modo_local ? 0 : null

  tags = merge(local.tags, { Name = "${local.nome_base}/cron-secret" })
}

resource "aws_secretsmanager_secret_version" "cron" {
  secret_id                = aws_secretsmanager_secret.cron.id
  secret_string            = var.modo_local ? var.cron_secret_local : null
  secret_string_wo         = var.modo_local ? null : ephemeral.random_password.cron.result
  secret_string_wo_version = var.modo_local ? null : var.versao_segredos
}
