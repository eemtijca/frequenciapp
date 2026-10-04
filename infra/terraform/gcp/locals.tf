# Dados derivados e nomes padronizados dos recursos GCP.

resource "random_string" "sufixo" {
  length  = 4
  upper   = false
  special = false
  numeric = true
}

# O número do projeto forma a URL padrão do Cloud Run em produção; no modo
# local o endereço da aplicação é fixo e o data source não é consultado.
data "google_project" "atual" {
  count      = var.modo_local ? 0 : 1
  project_id = var.projeto
}

locals {
  # O emulador guarda os recursos no projeto floci-local; em produção vale o
  # projeto informado na variável.
  projeto = var.modo_local ? "floci-local" : var.projeto

  nome_base = "${var.nome_aplicacao}-${var.ambiente}"

  # Rótulos do GCP exigem chaves em minúsculas, sem acentos e com no máximo 63
  # caracteres.
  rotulos = {
    aplicacao      = var.nome_aplicacao
    ambiente       = var.ambiente
    gerenciado_por = "terraform"
  }

  rede_privada = var.modo_local ? false : var.habilitar_rede_privada

  disponibilidade_banco = var.modo_local ? "ZONAL" : var.disponibilidade_banco

  protecao_exclusao = var.modo_local ? false : var.protecao_exclusao_banco

  retencao_backup = var.modo_local ? 1 : var.retencao_backup_dias

  habilitar_pitr = var.modo_local ? false : var.habilitar_pitr

  # O PostgreSQL do emulador roda sem TLS, então a exigência de SSL fica
  # restrita à produção.
  ssl_banco = var.modo_local ? "" : "?sslmode=require"

  ip_banco_local = google_sql_database_instance.banco.first_ip_address

  # O Cloud SQL não tem um papel de gestão criável: o administrador é o postgres
  # e é ele que atende tanto o runtime quanto as migrações e os scripts.
  url_banco_local = var.url_banco_local != null ? var.url_banco_local : format(
    "postgresql://%s:%s@%s:5432/frequencia",
    "postgres",
    var.senha_banco_local,
    local.ip_banco_local,
  )

  url_banco_producao = format(
    "postgresql://%s:%s@%s:5432/frequencia%s",
    "postgres",
    ephemeral.random_password.banco.result,
    google_sql_database_instance.banco.private_ip_address,
    local.ssl_banco,
  )

  endpoint_banco = format(
    "%s:5432",
    var.modo_local ? local.ip_banco_local : google_sql_database_instance.banco.private_ip_address,
  )

  # A URL padrão do Cloud Run segue o formato servico-numero.regiao.run.app; o
  # número vem do data source antes da criação do serviço.
  url_aplicacao = var.modo_local ? "http://localhost:3000" : format(
    "https://%s-%s.%s.run.app",
    local.nome_base,
    data.google_project.atual[0].number,
    var.regiao,
  )
}
